import { describe, expect, it } from "vitest";
import { evaluateRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

function assignedEvidence(runAttempt: unknown, ...jobAttempts: unknown[]) {
  const jobAttempt = jobAttempts.length === 0 ? runAttempt : jobAttempts[0];
  return {
    expected_head_sha: expectedHead,
    observed_at: "2026-08-10T00:00:00.000Z",
    queue_grace_milliseconds: 300_000,
    runs: [{
      id: 101,
      name: "ci",
      event: "pull_request",
      head_sha: expectedHead,
      run_attempt: runAttempt,
      status: "completed",
      conclusion: "success",
      created_at: "2026-08-09T23:50:00.000Z",
      jobs: [{
        id: 1001,
        name: "verify",
        run_attempt: jobAttempt,
        status: "completed",
        conclusion: "success",
        started_at: "2026-08-09T23:52:00.000Z",
        completed_at: "2026-08-09T23:53:00.000Z",
        runner_id: 77,
        runner_name: "GitHub Actions 77",
      }],
    }],
  };
}

describe("runner-assignment evaluator attempt identity", () => {
  it.each([undefined, null, 0, -1, 1.5, "1"])(
    "rejects non-positive-integer run_attempt evidence: %j",
    (runAttempt) => {
      const result = evaluateRunnerAssignmentEvidence(assignedEvidence(runAttempt));

      expect(result.status).toBe("FAIL");
      expect(result.failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "workflow_run_attempt_invalid" }),
      ]));
    },
  );

  it.each([undefined, null, 0, -1, 1.5, "2"])(
    "rejects malformed workflow-job run_attempt evidence: %j",
    (jobAttempt) => {
      const result = evaluateRunnerAssignmentEvidence(assignedEvidence(2, jobAttempt));

      expect(result.status).toBe("FAIL");
      expect(result.failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "workflow_job_attempt_invalid" }),
      ]));
    },
  );

  it("rejects a workflow job from a predecessor attempt", () => {
    const result = evaluateRunnerAssignmentEvidence(assignedEvidence(2, 1));

    expect(result.status).toBe("FAIL");
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "workflow_job_attempt_mismatch",
        run_attempt: 2,
        job_run_attempt: 1,
      }),
    ]));
  });

  it("does not let predecessor assignment suppress a current-attempt queue stall", () => {
    const result = evaluateRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      runs: [{
        id: 101,
        name: "ci",
        event: "pull_request",
        head_sha: expectedHead,
        run_attempt: 2,
        status: "queued",
        conclusion: null,
        created_at: "2026-08-09T23:50:00.000Z",
        jobs: [
          {
            id: 1001,
            name: "predecessor-verify",
            run_attempt: 1,
            status: "completed",
            conclusion: "success",
            started_at: "2026-08-09T23:52:00.000Z",
            completed_at: "2026-08-09T23:53:00.000Z",
            runner_id: 77,
            runner_name: "GitHub Actions 77",
          },
          {
            id: 1002,
            name: "current-verify",
            run_attempt: 2,
            status: "queued",
            conclusion: null,
            started_at: null,
            completed_at: null,
            runner_id: null,
            runner_name: null,
          },
        ],
      }],
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "workflow_job_attempt_mismatch", job_id: 1001 }),
      expect.objectContaining({ code: "runner_assignment_stalled", job_id: 1002 }),
    ]));
  });

  it("continues to accept matching positive run and job attempt identity", () => {
    const result = evaluateRunnerAssignmentEvidence(assignedEvidence(2, 2));

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
  });
});