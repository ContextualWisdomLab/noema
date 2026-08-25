import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../scripts/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";
const originalCwd = process.cwd();
const originalEnvironment = { ...process.env };
const originalExitCode = process.exitCode;
const temporaryDirectories: string[] = [];

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
}

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-runner-token-capability-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createGhShim(directory: string, expectedToken = "short-lived-runner-audit-token") {
  const executable = join(directory, "gh");
  const expectedTokenPath = join(directory, "expected-gh-token");
  writeFileSync(expectedTokenPath, expectedToken, { encoding: "utf8", mode: 0o600 });
  writeFileSync(executable, `#!/bin/sh
expected_token=$(cat -- "${expectedTokenPath}")
if [ "$GH_TOKEN" != "$expected_token" ]; then
  printf '%s' 'unexpected delegated GH_TOKEN' >&2
  exit 91
fi
case "$*" in
  *"/attempts/1/jobs?per_page=100"*)
    printf '%s' '[{"jobs":[{"id":1001,"name":"verify","run_attempt":1,"status":"completed","conclusion":"failure","started_at":"2026-08-09T23:52:00.000Z","completed_at":"2026-08-09T23:53:00.000Z","runner_id":77,"runner_name":"GitHub Actions 77"}]}]'
    ;;
  *)
    printf '%s' '{"id":100,"name":"ci","event":"pull_request","head_sha":"${expectedHead}","run_attempt":1,"status":"completed","conclusion":"failure","created_at":"2026-08-09T23:50:00.000Z"}'
    ;;
esac
`, "utf8");
  chmodSync(executable, 0o700);
}

function createTokenFile(directory: string) {
  const tokenPath = join(directory, "runner-audit-token");
  writeFileSync(tokenPath, "short-lived-runner-audit-token", { encoding: "utf8", mode: 0o600 });
  chmodSync(tokenPath, 0o600);
  return tokenPath;
}

function configureAuditEnvironment(directory: string, tokenPath?: string) {
  const previousPath = originalEnvironment.PATH ?? "/usr/bin:/bin";
  process.env.PATH = `${directory}:${previousPath}`;
  process.env.NOEMA_ACTIONS_AUDIT_REPOSITORY = "ContextualWisdomLab/noema";
  process.env.NOEMA_ACTIONS_AUDIT_HEAD_SHA = expectedHead;
  process.env.NOEMA_ACTIONS_AUDIT_RUN_IDS = "100";
  if (tokenPath) process.env.NOEMA_MAINTAINER_TOKEN_PATH = tokenPath;
}

afterEach(() => {
  process.chdir(originalCwd);
  restoreEnvironment();
  process.exitCode = originalExitCode;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("runner-assignment delegated GitHub token capability", () => {
  it("runs the production CLI from an owner-only capability file instead of ambient GH_TOKEN", async () => {
    const directory = temporaryDirectory();
    createGhShim(directory);
    const tokenPath = createTokenFile(directory);
    process.chdir(directory);
    configureAuditEnvironment(directory, tokenPath);
    process.env.GH_TOKEN = "ambient-runner-audit-token-decoy";

    const result = await main({
      observed_at: "2026-08-10T00:00:00.000Z",
      write_output: vi.fn(),
      set_exit_code: vi.fn(),
    });

    expect(result.exit_code).toBe(0);
    const reportPath = resolve(directory, "artifacts/operations/actions-runner-assignment-audit.json");
    expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
      status: "PASS",
      expected_head_sha: expectedHead,
    });
    expect(readFileSync(reportPath, "utf8")).not.toContain("short-lived-runner-audit-token");
    expect(readFileSync(reportPath, "utf8")).not.toContain("ambient-runner-audit-token-decoy");
  });

  it("does not enumerate unrelated parent secrets while constructing audit inputs", async () => {
    const directory = temporaryDirectory();
    createGhShim(directory);
    const tokenPath = createTokenFile(directory);
    process.chdir(directory);
    const hostileEnvironment: Record<string, string | undefined> = {
      PATH: `${directory}:${originalEnvironment.PATH ?? "/usr/bin:/bin"}`,
      NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema",
      NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead,
      NOEMA_ACTIONS_AUDIT_RUN_IDS: "100",
      NOEMA_MAINTAINER_TOKEN_PATH: tokenPath,
    };
    Object.defineProperty(hostileEnvironment, "NVIDIA_NIM_API_KEY", {
      enumerable: true,
      get() {
        throw new Error("unrelated secret was enumerated");
      },
    });

    await expect(main({
      env: hostileEnvironment,
      observed_at: "2026-08-10T00:00:00.000Z",
      write_output: vi.fn(),
      set_exit_code: vi.fn(),
    })).resolves.toMatchObject({ exit_code: 0 });
  });

  it.each([
    (path: string) => ` ${path}`,
    (path: string) => `${path} `,
    (path: string) => `\t${path}`,
    (path: string) => `${path}\n`,
  ])("fails closed before normalizing configured capability path whitespace", async (decoratePath) => {
    const directory = temporaryDirectory();
    createGhShim(directory);
    const tokenPath = createTokenFile(directory);
    process.chdir(directory);
    configureAuditEnvironment(directory, decoratePath(tokenPath));

    await expect(main({
      observed_at: "2026-08-10T00:00:00.000Z",
      write_output: vi.fn(),
      set_exit_code: vi.fn(),
    })).rejects.toThrow("Maintainer token file path must be canonical.");
  });

  it("fails closed when the delegated token path traverses a symlinked parent directory", async () => {
    const directory = temporaryDirectory();
    createGhShim(directory);
    const realCapabilityDirectory = join(directory, "real-capability");
    const linkedCapabilityDirectory = join(directory, "linked-capability");
    mkdirSync(realCapabilityDirectory, { mode: 0o700 });
    createTokenFile(realCapabilityDirectory);
    symlinkSync(realCapabilityDirectory, linkedCapabilityDirectory, "dir");
    process.chdir(directory);
    configureAuditEnvironment(directory, join(linkedCapabilityDirectory, "runner-audit-token"));

    await expect(main({
      observed_at: "2026-08-10T00:00:00.000Z",
      write_output: vi.fn(),
      set_exit_code: vi.fn(),
    })).rejects.toThrow("Maintainer token capability path must not traverse symlinked parent directories.");
  });

  it("fails closed when the delegated token parent chain cannot be verified", async () => {
    const directory = temporaryDirectory();
    process.chdir(directory);
    configureAuditEnvironment(directory, join(directory, "missing-parent", "runner-audit-token"));

    await expect(main({
      observed_at: "2026-08-10T00:00:00.000Z",
      write_output: vi.fn(),
      set_exit_code: vi.fn(),
    })).rejects.toThrow("Maintainer token capability parent directories could not be verified.");
  });

  it("fails closed when echo-style trailing newline contaminates the capability file", async () => {
    const directory = temporaryDirectory();
    createGhShim(directory);
    const tokenPath = join(directory, "runner-audit-token");
    writeFileSync(tokenPath, "short-lived-runner-audit-token\n", { encoding: "utf8", mode: 0o600 });
    chmodSync(tokenPath, 0o600);
    process.chdir(directory);
    configureAuditEnvironment(directory, tokenPath);

    await expect(main({
      observed_at: "2026-08-10T00:00:00.000Z",
      write_output: vi.fn(),
      set_exit_code: vi.fn(),
    })).rejects.toThrow("Maintainer token must not contain control characters.");
  });

  it("fails closed instead of accepting an ambient GH_TOKEN when the capability path is absent", async () => {
    const directory = temporaryDirectory();
    createGhShim(directory);
    process.chdir(directory);
    configureAuditEnvironment(directory);
    process.env.GH_TOKEN = "ambient-runner-audit-token-must-not-be-used";
    delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;

    await expect(main({
      observed_at: "2026-08-10T00:00:00.000Z",
      write_output: vi.fn(),
      set_exit_code: vi.fn(),
    })).rejects.toThrow("Maintainer token file path is required.");
  });
});