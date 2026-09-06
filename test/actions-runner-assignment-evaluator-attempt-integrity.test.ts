import { describe, expect, it } from "vitest";
import { evaluateRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

function assignedEvidence(runAttempt: unknown, ...jobAttempts: unknown[]) {
  const jobAttempt = jobAttempts.length === 0 ? runAttempt : jobAttempts[0];
  return {
    expected_head_sha: expectedHead,
    observed_at: "2026-08-10T00:00:00.000Z",
    queue_grace_milliseconds: 300_000,
    workflow_runs: [{
      workflow_run_id: 101,
      workflow_name: "ci",
      trigger_event: "pull_request",
      head_sha: expectedHead,
      run_attempt: runAttempt,
      workflow_run_status: "completed",
      workflow_conclusion: "success",
      created_at: "2026-08-09T23:50:00.000Z",
      workflow_jobs: [{
        workflow_job_id: 1001,
        workflow_job_name: "verify",
        run_attempt: jobAttempt,
        workflow_job_status: "completed",
        workflow_job_conclusion: "success",
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

      expect(result.audit_status).toBe("FAIL");
      expect(result.assignment_failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ failure_code: "workflow_run_attempt_invalid" }),
      ]));
    },
  );

  it.each([undefined, null, 0, -1, 1.5, "2"])(
    "rejects malformed workflow-job run_attempt evidence: %j",
    (jobAttempt) => {
      const result = evaluateRunnerAssignmentEvidence(assignedEvidence(2, jobAttempt));

      expect(result.audit_status).toBe("FAIL");
      expect(result.assignment_failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ failure_code: "workflow_job_attempt_invalid" }),
      ]));
    },
  );

  it("rejects a workflow job from a predecessor attempt", () => {
    const result = evaluateRunnerAssignmentEvidence(assignedEvidence(2, 1));

    expect(result.audit_status).toBe("FAIL");
    expect(result.assignment_failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        failure_code: "workflow_job_attempt_mismatch",
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
      workflow_runs: [{
        workflow_run_id: 101,
        workflow_name: "ci",
        trigger_event: "pull_request",
        head_sha: expectedHead,
        run_attempt: 2,
        workflow_run_status: "queued",
        workflow_conclusion: null,
        created_at: "2026-08-09T23:50:00.000Z",
        workflow_jobs: [
          {
            workflow_job_id: 1001,
            workflow_job_name: "predecessor-verify",
            run_attempt: 1,
            workflow_job_status: "completed",
            workflow_job_conclusion: "success",
            started_at: "2026-08-09T23:52:00.000Z",
            completed_at: "2026-08-09T23:53:00.000Z",
            runner_id: 77,
            runner_name: "GitHub Actions 77",
          },
          {
            workflow_job_id: 1002,
            workflow_job_name: "current-verify",
            run_attempt: 2,
            workflow_job_status: "queued",
            workflow_job_conclusion: null,
            started_at: null,
            completed_at: null,
            runner_id: null,
            runner_name: null,
          },
        ],
      }],
    });

    expect(result.audit_status).toBe("FAIL");
    expect(result.assignment_failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ failure_code: "workflow_job_attempt_mismatch", workflow_job_id: 1001 }),
      expect.objectContaining({ failure_code: "runner_assignment_stalled", workflow_job_id: 1002 }),
    ]));
  });

  it("continues to accept matching positive run and job attempt identity", () => {
    const result = evaluateRunnerAssignmentEvidence(assignedEvidence(2, 2));

    expect(result.audit_status).toBe("PASS");
    expect(result.assignment_failures).toEqual([]);
  });
});