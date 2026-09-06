import { describe, expect, it } from "vitest";
import { evaluateRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

describe("runner-assignment attempt identity retention", () => {
  it("retains the exact workflow attempt with runner-assignment evidence", () => {
    const decision = evaluateRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-24T02:30:00.000Z",
      queue_grace_milliseconds: 300_000,
      workflow_runs: [{
        workflow_run_id: 100,
        workflow_name: "ci",
        trigger_event: "pull_request",
        head_sha: expectedHead,
        run_attempt: 2,
        workflow_run_status: "completed",
        workflow_conclusion: "failure",
        created_at: "2026-08-24T02:29:00.000Z",
        workflow_jobs: [{
          workflow_job_id: 1001,
          workflow_job_name: "verify",
          run_attempt: 2,
          workflow_job_status: "completed",
          workflow_job_conclusion: "failure",
          started_at: "2026-08-24T02:29:10.000Z",
          completed_at: "2026-08-24T02:29:30.000Z",
          runner_id: 77,
          runner_name: "GitHub Actions 77",
        }],
      }],
    });

    expect(decision).toMatchObject({
      audit_status: "PASS",
      assignment_checks: [{
        check_code: "runner_assignment_observed",
        check_passed: true,
        workflow_run_id: 100,
        run_attempt: 2,
        workflow_job_id: 1001,
      }],
    });
  });
});
