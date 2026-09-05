import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS,
  evaluateRunnerAssignmentEvidence,
} from "../scripts/lib/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";
const observedAt = "2026-08-10T00:00:00.000Z";

function workflowRun(overrides: Record<string, unknown> = {}) {
  return {
    workflow_run_id: 101,
    run_attempt: 1,
    workflow_name: "ci",
    trigger_event: "pull_request",
    head_sha: expectedHead,
    workflow_run_status: "queued",
    workflow_conclusion: null,
    created_at: "2026-08-09T23:50:00.000Z",
    workflow_jobs: [
      {
        workflow_job_id: 201,
        workflow_job_name: "verify",
        run_attempt: 1,
        workflow_job_status: "queued",
        workflow_job_conclusion: null,
        started_at: null,
        completed_at: null,
        runner_id: null,
        runner_name: null,
      },
    ],
    ...overrides,
  };
}

function evaluate(workflowRuns: unknown[]) {
  return evaluateRunnerAssignmentEvidence({
    expected_head_sha: expectedHead,
    observed_at: observedAt,
    queue_grace_milliseconds: DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS,
    workflow_runs: workflowRuns,
  });
}

function failureCodes(result: ReturnType<typeof evaluateRunnerAssignmentEvidence>) {
  return result.assignment_failures.map(
    (assignmentFailure: { failure_code?: string }) => assignmentFailure.failure_code,
  );
}

describe("GitHub Actions runner-assignment evidence", () => {
  it("fails closed when a current-head job remains unassigned beyond the grace window", () => {
    const result = evaluate([workflowRun()]);
    expect(result.audit_status).toBe("FAIL");
    expect(failureCodes(result)).toContain("runner_assignment_stalled");
  });

  it("does not mistake GitHub's queued started_at timestamp for runner assignment", () => {
    const result = evaluate([workflowRun({
      workflow_jobs: [{
        workflow_job_id: 201,
        workflow_job_name: "verify",
        run_attempt: 1,
        workflow_job_status: "queued",
        workflow_job_conclusion: null,
        started_at: "2026-08-09T23:50:00.000Z",
        completed_at: null,
        runner_id: 0,
        runner_name: "",
      }],
    })]);

    expect(result.audit_status).toBe("FAIL");
    expect(failureCodes(result)).toContain("runner_assignment_stalled");
    expect(result.assignment_checks).not.toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_observed", workflow_job_id: 201 }),
    );
  });

  it("does not treat control-only runner names as assignment evidence", () => {
    const result = evaluate([workflowRun({
      workflow_run_status: "completed",
      workflow_conclusion: "failure",
      workflow_jobs: [{
        workflow_job_id: 201,
        workflow_job_name: "verify",
        run_attempt: 1,
        workflow_job_status: "completed",
        workflow_job_conclusion: "failure",
        started_at: "2026-08-09T23:52:00.000Z",
        completed_at: "2026-08-09T23:53:00.000Z",
        runner_id: 0,
        runner_name: "\u0000\u001f\u007f",
      }],
    })]);

    expect(result.audit_status).toBe("FAIL");
    expect(failureCodes(result)).toContain("runner_assignment_not_observed");
    expect(result.assignment_checks).not.toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_observed", workflow_job_id: 201 }),
    );
  });

  it("does not treat Unicode format-only runner names as assignment evidence", () => {
    const result = evaluate([workflowRun({
      workflow_run_status: "completed",
      workflow_conclusion: "failure",
      workflow_jobs: [{
        workflow_job_id: 201,
        workflow_job_name: "verify",
        run_attempt: 1,
        workflow_job_status: "completed",
        workflow_job_conclusion: "failure",
        started_at: "2026-08-09T23:52:00.000Z",
        completed_at: "2026-08-09T23:53:00.000Z",
        runner_id: 0,
        runner_name: "\u200b\u200e\u2060",
      }],
    })]);

    expect(result.audit_status).toBe("FAIL");
    expect(failureCodes(result)).toContain("runner_assignment_not_observed");
    expect(result.assignment_checks).not.toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_observed", workflow_job_id: 201 }),
    );
  });

  it("does not normalize embedded control or format characters into runner assignment authority", () => {
    const result = evaluate([workflowRun({
      workflow_run_status: "completed",
      workflow_conclusion: "failure",
      workflow_jobs: [{
        workflow_job_id: 201,
        workflow_job_name: "verify",
        run_attempt: 1,
        workflow_job_status: "completed",
        workflow_job_conclusion: "failure",
        started_at: "2026-08-09T23:52:00.000Z",
        completed_at: "2026-08-09T23:53:00.000Z",
        runner_id: 0,
        runner_name: "GitHub\u200b Actions 77",
      }],
    })]);

    expect(result.audit_status).toBe("FAIL");
    expect(failureCodes(result)).toContain("runner_assignment_not_observed");
    expect(result.assignment_checks).not.toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_observed", workflow_job_id: 201 }),
    );
  });

  it("keeps a recently queued unassigned job pending rather than calling it healthy", () => {
    const result = evaluate([workflowRun({ created_at: "2026-08-09T23:58:00.000Z" })]);
    expect(result.audit_status).toBe("PENDING");
    expect(result.assignment_checks).toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_pending", check_passed: false }),
    );
  });

  it("does not call an environment-protected waiting job a runner-assignment stall", () => {
    const result = evaluate([workflowRun({
      workflow_run_status: "waiting",
      workflow_jobs: [{
        workflow_job_id: 201,
        workflow_job_name: "deploy",
        run_attempt: 1,
        workflow_job_status: "waiting",
        workflow_job_conclusion: null,
        started_at: null,
        completed_at: null,
        runner_id: null,
        runner_name: null,
      }],
    })]);
    expect(result.audit_status).toBe("PENDING");
    expect(failureCodes(result)).not.toContain("runner_assignment_stalled");
    expect(result.assignment_checks).toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_pending", check_passed: false }),
    );
  });

  it("does not age a downstream queued job from workflow creation after another job has started", () => {
    const result = evaluate([workflowRun({
      workflow_run_status: "in_progress",
      workflow_jobs: [
        {
          workflow_job_id: 201,
          workflow_job_name: "build",
          run_attempt: 1,
          workflow_job_status: "in_progress",
          workflow_job_conclusion: null,
          started_at: "2026-08-09T23:51:00.000Z",
          completed_at: null,
          runner_id: 77,
          runner_name: "GitHub Actions 77",
        },
        {
          workflow_job_id: 202,
          workflow_job_name: "package",
          run_attempt: 1,
          workflow_job_status: "queued",
          workflow_job_conclusion: null,
          started_at: null,
          completed_at: null,
          runner_id: null,
          runner_name: null,
        },
      ],
    })]);
    expect(result.audit_status).toBe("PENDING");
    expect(failureCodes(result)).not.toContain("runner_assignment_stalled");
    expect(result.assignment_checks).toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_observed", check_passed: true, workflow_job_id: 201 }),
    );
    expect(result.assignment_checks).toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_pending", check_passed: false, workflow_job_id: 202 }),
    );
  });

  it("proves runner assignment independently from the later job conclusion", () => {
    const result = evaluate([workflowRun({
      workflow_run_status: "completed",
      workflow_conclusion: "failure",
      workflow_jobs: [{
        workflow_job_id: 201,
        workflow_job_name: "verify",
        run_attempt: 1,
        workflow_job_status: "completed",
        workflow_job_conclusion: "failure",
        started_at: "2026-08-09T23:52:00.000Z",
        completed_at: "2026-08-09T23:53:00.000Z",
        runner_id: 77,
        runner_name: "GitHub Actions 77",
      }],
    })]);
    expect(result.audit_status).toBe("PASS");
    expect(result.assignment_failures).toEqual([]);
    expect(result.assignment_checks).toContainEqual(
      expect.objectContaining({ check_code: "runner_assignment_observed", check_passed: true }),
    );
  });

  it("rejects workflow evidence from a different source head", () => {
    const result = evaluate([workflowRun({ head_sha: "fedcba9876543210fedcba9876543210fedcba98" })]);
    expect(result.audit_status).toBe("FAIL");
    expect(failureCodes(result)).toContain("workflow_run_head_mismatch");
  });

  it("fails closed when no workflow-run evidence is supplied", () => {
    const result = evaluate([]);
    expect(result.audit_status).toBe("FAIL");
    expect(failureCodes(result)).toContain("workflow_run_evidence_missing");
  });
});