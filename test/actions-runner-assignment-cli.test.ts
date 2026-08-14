import { describe, expect, it, vi } from "vitest";
import {
  createGhReadAdapters,
  createGhSubprocessEnvironment,
  ghApi,
  parseGhJsonEvidence,
  runActionsRunnerAssignmentAudit,
} from "../scripts/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

describe("runner-assignment operator audit", () => {
  it("uses only bounded read-only workflow-run and fully paginated job endpoints", async () => {
    const ghApiReader = vi.fn(async (path: string) => {
      if (path.endsWith("/jobs?filter=all&per_page=100")) {
        return [{ jobs: [{ id: 1001 }] }, { jobs: [{ id: 1002 }] }];
      }
      return { id: 100, head_sha: expectedHead, event: "pull_request" };
    });
    const adapters = createGhReadAdapters({ repository: "ContextualWisdomLab/noema", gh_api: ghApiReader });
    await expect(adapters.fetch_run(100)).resolves.toMatchObject({ id: 100 });
    await expect(adapters.fetch_job_pages(100)).resolves.toEqual([{ jobs: [{ id: 1001 }] }, { jobs: [{ id: 1002 }] }]);
    expect(ghApiReader).toHaveBeenNthCalledWith(1, "repos/ContextualWisdomLab/noema/actions/runs/100", { paginate: false });
    expect(ghApiReader).toHaveBeenNthCalledWith(2, "repos/ContextualWisdomLab/noema/actions/runs/100/jobs?filter=all&per_page=100", { paginate: true });
  });

  it.each([
    ["/repos/ContextualWisdomLab/noema/actions/runs/100", "outside"],
    ["repos/ContextualWisdomLab/noema/../other", "outside"],
    ["repos/ContextualWisdomLab/noema/actions/runs/100\u0000", "outside"],
    [`repos/${"a".repeat(1000)}`, "invalid"],
  ])("rejects unbounded GitHub API paths before subprocess setup: %s", (path, message) => {
    expect(() => ghApi(path)).toThrow(message);
  });

  it("rejects malformed UTF-8 and duplicate decoded keys in GitHub API evidence", () => {
    expect(() => parseGhJsonEvidence(Buffer.concat([
      Buffer.from('{"id":100,"name":"', "utf8"),
      Buffer.from([0xff]),
      Buffer.from('"}', "utf8"),
    ]))).toThrow("invalid UTF-8");

    expect(() => parseGhJsonEvidence(Buffer.from('{"id":100,"i\\u0064":101}', "utf8"))).toThrow(
      "duplicate decoded object keys",
    );

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

  it("rejects queue grace beyond the evaluator maximum before GitHub access", async () => {
    const ghApiReader = vi.fn();
    await expect(runActionsRunnerAssignmentAudit({
      env: {
        GH_TOKEN: "token",
        NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead,
        NOEMA_ACTIONS_AUDIT_RUN_IDS: "100",
        NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS: "1800001",
      },
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: vi.fn(),
    })).rejects.toThrow("at most 1800000");
    expect(ghApiReader).not.toHaveBeenCalled();
  });

  it("returns nonzero for fresh pending assignment without promoting it to success", async () => {
    const writeReport = vi.fn();
    const ghApiReader = vi.fn(async (path: string) => {
      if (path.endsWith("/jobs?filter=all&per_page=100")) {
        return [{ jobs: [{ id: 1001, name: "verify", status: "queued", conclusion: null, started_at: null, completed_at: null, runner_id: null, runner_name: null }] }];
      }
      return { id: 100, name: "ci", event: "pull_request", head_sha: expectedHead, status: "queued", conclusion: null, created_at: "2026-08-09T23:58:00.000Z" };
    });
    const result = await runActionsRunnerAssignmentAudit({
      env: {
        GH_TOKEN: "present-but-never-retained",
        NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead,
        NOEMA_ACTIONS_AUDIT_RUN_IDS: "100",
      },
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApiReader,
      write_report: writeReport,
    });
    expect(result.exit_code).toBe(1);
    expect(result.report).toMatchObject({ schema_version: 1, objective: "github_actions_runner_assignment", repository: "ContextualWisdomLab/noema", expected_head_sha: expectedHead, selected_run_ids: [100], status: "PENDING" });
    expect(JSON.stringify(result.report)).not.toContain("present-but-never-retained");
    expect(writeReport).toHaveBeenCalledOnce();
  });

  it("fails before GitHub access when repository or credentials are outside the bounded contract", async () => {
    const ghApiReader = vi.fn();
    await expect(runActionsRunnerAssignmentAudit({
      env: { GH_TOKEN: "token", NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/other", NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead, NOEMA_ACTIONS_AUDIT_RUN_IDS: "100" },
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
});