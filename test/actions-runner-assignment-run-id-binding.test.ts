import { describe, expect, it, vi } from "vitest";
import { collectRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-source.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

describe("runner-assignment workflow-run identity", () => {
  it("rejects a fetched workflow run whose id differs from the selected run id", async () => {
    const fetchJobPages = vi.fn(async (_runId: number, _runAttempt: number) => [{
      jobs: [{
        id: 2020,
        name: "verify",
        status: "completed",
        conclusion: "success",
        started_at: "2026-08-09T23:51:00.000Z",
        completed_at: "2026-08-09T23:52:00.000Z",
        runner_id: 44,
        runner_name: "GitHub Actions 44",
      }],
    }]);

    await expect(collectRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      run_ids: [101],
      fetch_run: vi.fn(async () => ({
        id: 202,
        name: "ci",
        event: "pull_request",
        head_sha: expectedHead,
        run_attempt: 1,
        status: "completed",
        conclusion: "success",
        created_at: "2026-08-09T23:50:00.000Z",
      })),
      fetch_job_pages: fetchJobPages,
    })).rejects.toThrow("selected workflow run id");
    expect(fetchJobPages).not.toHaveBeenCalled();
  });
});
