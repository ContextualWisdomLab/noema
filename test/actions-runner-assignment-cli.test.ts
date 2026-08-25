import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGhReadAdapters,
  createGhSubprocessEnvironment,
  ghApi,
  main,
  parseGhJsonEvidence,
  runActionsRunnerAssignmentAudit,
  runIfDirect,
  startCli,
  writeReportAtomically,
} from "../scripts/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";
const originalCwd = process.cwd();
const originalEnvironment = { ...process.env };
const originalExitCode = process.exitCode;

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
}

function assignedRunApi(path: string) {
  if (path.endsWith("/attempts/1/jobs?per_page=100")) {
    return [{
      jobs: [{
        id: 1001,
        name: "verify",
        run_attempt: 1,
        status: "completed",
        conclusion: "failure",
        started_at: "2026-08-09T23:52:00.000Z",
        completed_at: "2026-08-09T23:53:00.000Z",
        runner_id: 77,
        runner_name: "GitHub Actions 77",
      }],
    }];
  }
  return {
    id: 100,
    name: "ci",
    event: "pull_request",
    head_sha: expectedHead,
    run_attempt: 1,
    status: "completed",
    conclusion: "failure",
    created_at: "2026-08-09T23:50:00.000Z",
  };
}

function auditEnvironment(overrides: Record<string, string> = {}) {
  return {
    GH_TOKEN: "present-but-never-retained",
    NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema",
    NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead,
    NOEMA_ACTIONS_AUDIT_RUN_IDS: "100",
    ...overrides,
  };
}

function createGhShim(directory: string, expectedToken: string) {
  const executable = join(directory, "gh");
  const expectedTokenPath = join(directory, "expected-gh-token");
  writeFileSync(expectedTokenPath, expectedToken, { encoding: "utf8", mode: 0o600 });
  const tokenGuard = `expected_token=$(cat -- "${expectedTokenPath}")
if [ "$GH_TOKEN" != "$expected_token" ]; then
  printf '%s' 'unexpected delegated GH_TOKEN' >&2
  exit 91
fi
`;
  writeFileSync(executable, `#!/bin/sh
${tokenGuard}case "$*" in
  *"/attempts/1/jobs?per_page=100"*)
    printf '%s' '[{"jobs":[{"id":1001,"name":"verify","run_attempt":1,"status":"completed","conclusion":"failure","started_at":"2026-08-09T23:52:00.000Z","completed_at":"2026-08-09T23:53:00.000Z","runner_id":77,"runner_name":"GitHub Actions 77"}]}]'
    ;;
  *)
    printf '%s' '{"id":100,"name":"ci","event":"pull_request","head_sha":"${expectedHead}","run_attempt":1,"status":"completed","conclusion":"failure","created_at":"2026-08-09T23:50:00.000Z"}'
    ;;
esac
`, "utf8");
  chmodSync(executable, 0o700);
  return executable;
}

afterEach(() => {
  process.chdir(originalCwd);
  restoreEnvironment();
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("runner-assignment operator audit", () => {
  it("uses only bounded read-only workflow-run and exact-attempt job endpoints", async () => {
    const ghApiReader = vi.fn(async (path: string) => {
      if (path.endsWith("/attempts/2/jobs?per_page=100")) {
        return [{ jobs: [{ id: 1001 }] }, { jobs: [{ id: 1002 }] }];
      }
      return { id: 100, head_sha: expectedHead, event: "pull_request", run_attempt: 2 };
    });
    const adapters = createGhReadAdapters({ repository: "ContextualWisdomLab/noema", gh_api: ghApiReader });
    await expect(adapters.fetch_run(100)).resolves.toMatchObject({ id: 100, run_attempt: 2 });
    await expect(adapters.fetch_job_pages(100, 2)).resolves.toEqual([{ jobs: [{ id: 1001 }] }, { jobs: [{ id: 1002 }] }]);
    expect(ghApiReader).toHaveBeenNthCalledWith(1, "repos/ContextualWisdomLab/noema/actions/runs/100", { paginate: false });
    expect(ghApiReader).toHaveBeenNthCalledWith(2, "repos/ContextualWisdomLab/noema/actions/runs/100/attempts/2/jobs?per_page=100", { paginate: true });
  });

  it("fails closed on invalid read-adapter authority", () => {
    expect(() => createGhReadAdapters(null)).toThrow("restricted");
    expect(() => createGhReadAdapters({ repository: "ContextualWisdomLab/other", gh_api: vi.fn() })).toThrow("restricted");
    expect(() => createGhReadAdapters({ repository: "ContextualWisdomLab/noema", gh_api: null })).toThrow("read-only");
  });

  it.each([
    ["/repos/ContextualWisdomLab/noema/actions/runs/100", "outside"],
    ["repos/ContextualWisdomLab/noema/../other", "outside"],
    ["repos/ContextualWisdomLab/noema/actions/runs/100\u0000", "outside"],
    [`repos/${"a".repeat(1000)}`, "invalid"],
    ["", "invalid"],
  ])("rejects unbounded GitHub API paths before subprocess setup: %s", (path, message) => {
    expect(() => ghApi(path)).toThrow(message);
  });

  it("executes the GitHub CLI through an injected shell-free bounded runtime", () => {
    const spawn = vi.fn(() => ({
      error: undefined,
      status: 0,
      stdout: Buffer.from('{"id":100}', "utf8"),
      stderr: Buffer.alloc(0),
    }));
    expect(ghApi(
      "repos/ContextualWisdomLab/noema/actions/runs/100/attempts/1/jobs?per_page=100",
      { paginate: true },
      { spawn_sync: spawn, environment: { PATH: "/usr/bin", GH_TOKEN: "token" } },
    )).toEqual({ id: 100 });
    expect(spawn).toHaveBeenCalledOnce();
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe("gh");
    expect(args).toContain("--paginate");
    expect(args).toContain("--slurp");
    expect(options).toMatchObject({
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { PATH: "/usr/bin", GH_TOKEN: "token", GH_HOST: "github.com", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  });

  it("fails closed on missing runtime, spawn errors, and nonzero gh exits", () => {
    expect(() => ghApi(
      "repos/ContextualWisdomLab/noema/actions/runs/100",
      {},
      { spawn_sync: null, environment: { PATH: "/usr/bin", GH_TOKEN: "token" } },
    )).toThrow("spawn runtime");

    expect(() => ghApi(
      "repos/ContextualWisdomLab/noema/actions/runs/100",
      {},
      {
        spawn_sync: () => ({ error: new Error("spawn failed\u0000"), status: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
        environment: { PATH: "/usr/bin", GH_TOKEN: "token" },
      },
    )).toThrow("spawn failed");

    expect(() => ghApi(
      "repos/ContextualWisdomLab/noema/actions/runs/100",
      {},
      {
        spawn_sync: () => ({ error: undefined, status: 7, stdout: Buffer.alloc(0), stderr: Buffer.from("bad\u0000stderr\n", "utf8") }),
        environment: { PATH: "/usr/bin", GH_TOKEN: "token" },
      },
    )).toThrow("gh exit 7: bad stderr");
  });

  it("rejects malformed UTF-8, malformed JSON, and duplicate decoded keys in GitHub API evidence", () => {
    expect(() => parseGhJsonEvidence("not-bytes" as unknown as Uint8Array)).toThrow("raw bytes");
    expect(() => parseGhJsonEvidence(Buffer.concat([
      Buffer.from('{"id":100,"name":"', "utf8"),
      Buffer.from([0xff]),
      Buffer.from('"}', "utf8"),
    ]))).toThrow("invalid UTF-8");

    expect(() => parseGhJsonEvidence(Buffer.from('{"id":100,"i\\u0064":101}', "utf8"))).toThrow(
      "duplicate decoded object keys",
    );
    expect(() => parseGhJsonEvidence(Buffer.from('{"id":', "utf8"))).toThrow("malformed JSON");

    expect(parseGhJsonEvidence(Buffer.from('{"id":100,"head_sha":"0123456789abcdef0123456789abcdef01234567"}', "utf8"))).toEqual({
      id: 100,
      head_sha: expectedHead,
    });
  });

  it("isolates the gh subprocess from unrelated repository, model, and proxy credentials", () => {
    expect(createGhSubprocessEnvironment({
      PATH: "/usr/bin:/bin",
      GH_TOKEN: "read-only-token",
      GITHUB_TOKEN: "must-not-cross",
      NVIDIA_NIM_API_KEY: "must-not-cross",
      NOEMA_MAINTAINER_APP_PRIVATE_KEY: "must-not-cross",
      HTTPS_PROXY: "https://ambient-proxy.invalid",
      HOME: "/home/runner",
    })).toEqual({
      PATH: "/usr/bin:/bin",
      GH_TOKEN: "read-only-token",
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
  });

  it("fails closed before spawning gh when the minimal subprocess environment is incomplete", () => {
    expect(() => createGhSubprocessEnvironment(null)).toThrow("environment");
    expect(() => createGhSubprocessEnvironment({ GH_TOKEN: "token" })).toThrow("PATH");
    expect(() => createGhSubprocessEnvironment({ PATH: "/usr/bin" })).toThrow("GH_TOKEN");
  });

  it("publishes reports atomically and preserves the original failure through cleanup", () => {
    const directoryMetadata = {
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    const normalIo = {
      lstatSync: vi.fn(() => directoryMetadata),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => 41),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(() => { throw new Error("already renamed"); }),
      randomUUID: vi.fn(() => "uuid"),
    };
    expect(writeReportAtomically({ status: "PASS" }, normalIo)).toContain("actions-runner-assignment-audit.json");
    expect(normalIo.lstatSync).toHaveBeenCalled();
    expect(normalIo.closeSync).toHaveBeenCalledWith(41);
    expect(normalIo.renameSync).toHaveBeenCalledOnce();

    const cleanupClose = vi.fn(() => { throw new Error("cleanup close failed"); });
    const cleanupUnlink = vi.fn();
    const failingIo = {
      ...normalIo,
      openSync: vi.fn(() => 42),
      closeSync: cleanupClose,
      unlinkSync: cleanupUnlink,
    };
    expect(() => writeReportAtomically({ value: 1n }, failingIo)).toThrow("BigInt");
    expect(cleanupClose).toHaveBeenCalledWith(42);
    expect(cleanupUnlink).toHaveBeenCalledOnce();
  });

  it("rejects malformed operator inputs before GitHub access", async () => {
    const ghApiReader = vi.fn();
    const writer = vi.fn();
    await expect(runActionsRunnerAssignmentAudit(null)).rejects.toThrow("input");
    await expect(runActionsRunnerAssignmentAudit({ env: null })).rejects.toThrow("environment");
    await expect(runActionsRunnerAssignmentAudit({ env: auditEnvironment({ GH_TOKEN: "" }) })).rejects.toThrow("GH_TOKEN");
    await expect(runActionsRunnerAssignmentAudit({
      env: auditEnvironment({ NOEMA_ACTIONS_AUDIT_HEAD_SHA: "ABC" }),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: writer,
    })).rejects.toThrow("canonical lowercase");
    await expect(runActionsRunnerAssignmentAudit({
      env: auditEnvironment({ NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS: "0" }),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: writer,
    })).rejects.toThrow("positive integer");
    await expect(runActionsRunnerAssignmentAudit({
      env: auditEnvironment({ NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS: "9007199254740992" }),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: writer,
    })).rejects.toThrow("safe integer");
    await expect(runActionsRunnerAssignmentAudit({
      env: auditEnvironment({ NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS: "1800001" }),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: writer,
    })).rejects.toThrow("at most 1800000");
    await expect(runActionsRunnerAssignmentAudit({
      env: auditEnvironment(),
      observed_at: "not-a-date",
      gh_api: ghApiReader,
      write_report: writer,
    })).rejects.toThrow("canonical UTC timestamp");
    await expect(runActionsRunnerAssignmentAudit({
      env: auditEnvironment(),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: null,
    })).rejects.toThrow("report writer");
    expect(ghApiReader).not.toHaveBeenCalled();
  });

  it("returns nonzero for fresh pending assignment without promoting it to success", async () => {
    const writeReport = vi.fn();
    const ghApiReader = vi.fn(async (path: string) => {
      if (path.endsWith("/attempts/1/jobs?per_page=100")) {
        return [{ jobs: [{ id: 1001, name: "verify", run_attempt: 1, status: "queued", conclusion: null, started_at: null, completed_at: null, runner_id: null, runner_name: null }] }];
      }
      return { id: 100, name: "ci", event: "pull_request", head_sha: expectedHead, run_attempt: 1, status: "queued", conclusion: null, created_at: "2026-08-09T23:58:00.000Z" };
    });
    const result = await runActionsRunnerAssignmentAudit({
      env: auditEnvironment({ NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS: "" }),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: writeReport,
    });
    expect(result.exit_code).toBe(1);
    expect(result.report).toMatchObject({ schema_version: 1, objective: "github_actions_runner_assignment", repository: "ContextualWisdomLab/noema", expected_head_sha: expectedHead, selected_run_ids: [100], status: "PENDING" });
    expect(JSON.stringify(result.report)).not.toContain("present-but-never-retained");
    expect(writeReport).toHaveBeenCalledOnce();
  });

  it("returns zero for proven assignment while keeping workflow conclusion authority separate", async () => {
    const writeReport = vi.fn();
    const result = await runActionsRunnerAssignmentAudit({
      env: auditEnvironment({ NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS: "1000" }),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: vi.fn(async (path: string) => assignedRunApi(path)),
      write_report: writeReport,
    });
    expect(result.exit_code).toBe(0);
    expect(result.report.status).toBe("PASS");
    expect(result.report.authority).toEqual({
      runner_assignment_only: true,
      required_check_success: false,
      review_authority: false,
      merge_authority: false,
      release_authority: false,
      deployment_authority: false,
    });
  });

  it("fails before GitHub access when repository or credentials are outside the bounded contract", async () => {
    const ghApiReader = vi.fn();
    await expect(runActionsRunnerAssignmentAudit({
      env: { ...auditEnvironment(), NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/other" },
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: vi.fn(),
    })).rejects.toThrow("ContextualWisdomLab/noema");
    await expect(runActionsRunnerAssignmentAudit({
      env: { NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema", NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead, NOEMA_ACTIONS_AUDIT_RUN_IDS: "100" },
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: vi.fn(),
    })).rejects.toThrow("GH_TOKEN");
    expect(ghApiReader).not.toHaveBeenCalled();
  });

  it("runs main with injected output and exit-code boundaries", async () => {
    const writeOutput = vi.fn();
    const setExitCode = vi.fn();
    const writeReport = vi.fn();
    const result = await main({
      env: auditEnvironment(),
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: vi.fn(async (path: string) => assignedRunApi(path)),
      write_report: writeReport,
      write_output: writeOutput,
      set_exit_code: setExitCode,
    });
    expect(result.exit_code).toBe(0);
    expect(writeOutput).toHaveBeenCalledWith("PASS\n");
    expect(setExitCode).toHaveBeenCalledWith(0);
  });

  it("runs the default CLI dependencies against a real local gh shim and capability file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-runner-audit-"));
    const previousPath = process.env.PATH ?? "";
    try {
      createGhShim(directory, "read-only-capability-token");
      process.chdir(directory);
      const { GH_TOKEN: _ambientToken, ...operatorEnvironment } = auditEnvironment();
      Object.assign(process.env, operatorEnvironment);
      process.env.GH_TOKEN = "ambient-runner-audit-token-decoy";
      process.env.PATH = `${directory}:${previousPath}`;
      const tokenPath = join(directory, "runner-audit-token");
      writeFileSync(tokenPath, "read-only-capability-token", { encoding: "utf8", mode: 0o600 });
      chmodSync(tokenPath, 0o600);
      process.env.NOEMA_MAINTAINER_TOKEN_PATH = tokenPath;
      const result = await main();
      expect(result.exit_code).toBe(0);
      const reportPath = resolve(directory, "artifacts/operations/actions-runner-assignment-audit.json");
      expect(existsSync(reportPath)).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
        status: "PASS",
        expected_head_sha: expectedHead,
      });
      const reportText = readFileSync(reportPath, "utf8");
      expect(reportText).not.toContain("read-only-capability-token");
      expect(reportText).not.toContain("ambient-runner-audit-token-decoy");
    } finally {
      process.chdir(originalCwd);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("tests direct-entry dispatch independently from CLI error handling", async () => {
    const execute = vi.fn();
    expect(runIfDirect("file:///tmp/a.mjs", ["node"], execute)).toBe(false);
    expect(runIfDirect("file:///tmp/a.mjs", ["node", "/tmp/b.mjs"], execute)).toBe(false);
    expect(runIfDirect(pathToFileURL("/tmp/a.mjs").href, ["node", "/tmp/a.mjs"], execute)).toBe(true);
    expect(execute).toHaveBeenCalledOnce();

    const writeError = vi.fn();
    const setExitCode = vi.fn();
    await expect(startCli({
      execute: async () => { throw new Error("bad\u0000failure"); },
      write_error: writeError,
      set_exit_code: setExitCode,
    })).resolves.toBeUndefined();
    expect(writeError).toHaveBeenCalledWith("runner-assignment audit failed: bad failure\n");
    expect(setExitCode).toHaveBeenCalledWith(2);

    const success = vi.fn(async () => ({ exit_code: 0 }));
    await expect(startCli({ execute: success, write_error: writeError, set_exit_code: setExitCode })).resolves.toEqual({ exit_code: 0 });
  });
});