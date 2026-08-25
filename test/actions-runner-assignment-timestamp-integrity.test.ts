import { describe, expect, it } from "vitest";
import { evaluateRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

function assignedRun(createdAt: string) {
  return {
    id: 101,
    run_attempt: 1,
    name: "ci",
    event: "pull_request",
    head_sha: expectedHead,
    status: "completed",
    conclusion: "success",
    created_at: createdAt,
    jobs: [
      {
        id: 201,
        name: "verify",
        status: "completed",
        conclusion: "success",
        started_at: "2026-03-01T00:00:01Z",
        completed_at: "2026-03-01T00:00:02Z",
        runner_id: 77,
        runner_name: "GitHub Actions 77",
      },
    ],
  };
}

function evaluate(observedAt: string, createdAt: string) {
  return evaluateRunnerAssignmentEvidence({
    expected_head_sha: expectedHead,
    observed_at: observedAt,
    queue_grace_milliseconds: 300_000,
    runs: [assignedRun(createdAt)],
  });
}

describe("runner-assignment timestamp integrity", () => {
  it("rejects an impossible observed_at calendar date instead of normalizing it", () => {
    const result = evaluate(
      "2026-02-30T00:00:00.000Z",
      "2026-03-01T00:00:00Z",
    );

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "runner_evidence_invalid" }),
    );
  });

  it("rejects a future observed_at before it can manufacture runner-assignment authority", () => {
    const result = evaluate(
      "2099-01-01T00:00:00.000Z",
      "2026-03-01T00:00:00Z",
    );

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "runner_evidence_invalid" }),
    );
  });

  it("rejects an impossible workflow created_at calendar date instead of normalizing it", () => {
    const result = evaluate(
      "2026-03-03T00:00:00.000Z",
      "2026-02-30T00:00:00Z",
    );

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_run_timestamp_invalid" }),
    );
  });
});
