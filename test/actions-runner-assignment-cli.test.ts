import { describe, expect, it, vi } from "vitest";
import {
  createGhReadAdapters,
  runActionsRunnerAssignmentAudit,
} from "../scripts/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

describe("runner-assignment operator audit", () => {
  it("uses only bounded read-only workflow-run and fully paginated job endpoints", async () => {
    const ghApi = vi.fn(async (path: string) => {
      if (path.endsWith("/jobs?filter=all&per_page=100")) {
        return [{ jobs: [{ id: 1001 }] }, { jobs: [{ id: 1002 }] }];
      }
      return { id: 100, head_sha: expectedHead, event: "pull_request" };
    });
    const adapters = createGhReadAdapters({ repository: "ContextualWisdomLab/noema", gh_api: ghApi });
    await expect(adapters.fetch_run(100)).resolves.toMatchObject({ id: 100 });
    await expect(adapters.fetch_job_pages(100)).resolves.toEqual([{ jobs: [{ id: 1001 }] }, { jobs: [{ id: 1002 }] }]);
    expect(ghApi).toHaveBeenNthCalledWith(1, "repos/ContextualWisdomLab/noema/actions/runs/100", { paginate: false });
    expect(ghApi).toHaveBeenNthCalledWith(2, "repos/ContextualWisdomLab/noema/actions/runs/100/jobs?filter=all&per_page=100", { paginate: true });
  });

  it("returns nonzero for fresh pending assignment without promoting it to success", async () => {
    const writeReport = vi.fn();
    const ghApi = vi.fn(async (path: string) => {
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
      gh_api: ghApi,
      write_report: writeReport,
    });
    expect(result.exit_code).toBe(1);
    expect(result.report).toMatchObject({ schema_version: 1, objective: "github_actions_runner_assignment", repository: "ContextualWisdomLab/noema", expected_head_sha: expectedHead, selected_run_ids: [100], status: "PENDING" });
    expect(JSON.stringify(result.report)).not.toContain("present-but-never-retained");
    expect(writeReport).toHaveBeenCalledOnce();
  });

  it("fails before GitHub access when repository or credentials are outside the bounded contract", async () => {
    const ghApi = vi.fn();
    await expect(runActionsRunnerAssignmentAudit({
      env: { GH_TOKEN: "token", NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/other", NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead, NOEMA_ACTIONS_AUDIT_RUN_IDS: "100" },
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApi,
      write_report: vi.fn(),
    })).rejects.toThrow("ContextualWisdomLab/noema");
    await expect(runActionsRunnerAssignmentAudit({
      env: { NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema", NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead, NOEMA_ACTIONS_AUDIT_RUN_IDS: "100" },
      observed_at: "2026-08-10T00:00:00.000Z",
      gh_api: ghApi,
      write_report: vi.fn(),
    })).rejects.toThrow("GH_TOKEN");
    expect(ghApi).not.toHaveBeenCalled();
  });
});
