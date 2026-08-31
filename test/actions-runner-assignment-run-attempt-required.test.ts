import { describe, expect, it, vi } from "vitest";
import { collectRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-source.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

describe("runner-assignment workflow-run attempt authority", () => {
  it("rejects workflow-run evidence that omits run_attempt", async () => {
    const fetchJobPages = vi.fn(async (_runId: number, _runAttempt: number) => [{ jobs: [] }]);

    await expect(collectRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      run_ids: [101],
      fetch_run: vi.fn(async () => ({
        id: 101,
        name: "ci",
        event: "pull_request",
        head_sha: expectedHead,
        status: "queued",
        conclusion: null,
        created_at: "2026-08-09T23:50:00.000Z",
      })),
      fetch_job_pages: fetchJobPages,
    })).rejects.toThrow("run_attempt must be a positive integer");
    expect(fetchJobPages).not.toHaveBeenCalled();
  });
});
