import { describe, expect, it } from "vitest";
import { evaluateRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

describe("runner-assignment attempt identity retention", () => {
  it("retains the exact workflow attempt with runner-assignment evidence", () => {
    const decision = evaluateRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-24T02:30:00.000Z",
      queue_grace_milliseconds: 300_000,
      runs: [{
        id: 100,
        name: "ci",
        event: "pull_request",
        head_sha: expectedHead,
        run_attempt: 2,
        status: "completed",
        conclusion: "failure",
        created_at: "2026-08-24T02:29:00.000Z",
        jobs: [{
          id: 1001,
          name: "verify",
          status: "completed",
          conclusion: "failure",
          started_at: "2026-08-24T02:29:10.000Z",
          completed_at: "2026-08-24T02:29:30.000Z",
          runner_id: 77,
          runner_name: "GitHub Actions 77",
        }],
      }],
    });

    expect(decision).toMatchObject({
      status: "PASS",
      checks: [{
        code: "runner_assignment_observed",
        pass: true,
        run_id: 100,
        run_attempt: 2,
        job_id: 1001,
      }],
    });
  });
});
