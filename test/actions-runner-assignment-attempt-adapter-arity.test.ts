import { describe, expect, it } from "vitest";

import { collectRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-source.mjs";

describe("runner-assignment attempt adapter contract", () => {
  it("accepts an attempt-scoped adapter even when JavaScript function arity is one", async () => {
    const observedAttempts: number[] = [];
    const evidence = await collectRunnerAssignmentEvidence({
      run_ids: [123],
      expected_head_sha: "a".repeat(40),
      observed_at: "2026-08-25T00:00:00.000Z",
      queue_grace_milliseconds: 60_000,
      fetch_run: async (runId: number) => ({
        id: runId,
        name: "ci",
        event: "pull_request",
        head_sha: "a".repeat(40),
        run_attempt: 2,
        status: "completed",
        conclusion: "success",
        created_at: "2026-08-25T00:00:00Z",
      }),
      fetch_job_pages: async (_runId: number, runAttempt = 1) => {
        observedAttempts.push(runAttempt);
        return [{ jobs: [] }];
      },
    });

    expect(observedAttempts).toEqual([2]);
    expect(evidence.runs[0]?.run_attempt).toBe(2);
  });
});
