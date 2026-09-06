import { describe, expect, it, vi } from "vitest";
import { runActionsRunnerAssignmentAudit } from "../scripts/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

function assignedRunApi(path: string) {
  if (path.endsWith("/attempts/1/jobs?per_page=100")) {
    return [{
      jobs: [{
        id: 1001,
        name: "verify",
        run_attempt: 1,
        status: "completed",
        conclusion: "failure",
        started_at: "2026-09-01T19:00:10.000Z",
        completed_at: "2026-09-01T19:00:30.000Z",
        runner_id: 77,
        runner_name: "GitHub Actions 77",
      }],
    }];
  }

  return {
    id: 100,
    name: "ci",
    event: "pull_request",
    head_sha: expectedHead,
    run_attempt: 1,
    status: "completed",
    conclusion: "failure",
    created_at: "2026-09-01T19:00:00.000Z",
  };
}

function invalidEventRunApi(path: string) {
  if (path.endsWith("/attempts/1/jobs?per_page=100")) {
    return [{
      jobs: [{
        id: 1001,
        name: "verify",
        run_attempt: 1,
        status: "queued",
        conclusion: null,
        started_at: null,
        completed_at: null,
        runner_id: null,
        runner_name: null,
      }],
    }];
  }

  return {
    id: 100,
    name: "ci",
    event: "workflow_dispatch",
    head_sha: expectedHead,
    run_attempt: 1,
    status: "queued",
    conclusion: null,
    created_at: "2026-09-01T19:00:00.000Z",
  };
}

function auditEnvironment(): Record<string, string> {
  return {
    GH_TOKEN: "present-but-never-retained",
    NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema",
    NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead,
    NOEMA_ACTIONS_AUDIT_RUN_IDS: "100",
    NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS: "1000",
  };
}

describe("runner-assignment CLI semantic report contract", () => {
  it("keeps semantic evaluator names behind the stable schema-version-one check shape", async () => {
    const writeReport = vi.fn();
    const result = await runActionsRunnerAssignmentAudit({
      env: auditEnvironment(),
      observed_at: "2026-09-01T19:01:00.000Z",
      gh_api: vi.fn(async (path: string) => assignedRunApi(path)),
      write_report: writeReport,
    });

    expect(result).toMatchObject({
      exit_code: 0,
      report: {
        schema_version: 1,
        status: "PASS",
        failures: [],
        checks: [{
          code: "runner_assignment_observed",
          pass: true,
          detail: expect.any(String),
          workflow_run_id: 100,
          run_attempt: 1,
          workflow_job_id: 1001,
        }],
      },
    });
    expect(result.report.checks[0]).not.toHaveProperty("check_code");
    expect(result.report.checks[0]).not.toHaveProperty("check_passed");
    expect(result.report.checks[0]).not.toHaveProperty("check_detail");
    expect(writeReport).toHaveBeenCalledWith(result.report);
  });

  it("keeps semantic evaluator names behind the stable schema-version-one failure shape", async () => {
    const result = await runActionsRunnerAssignmentAudit({
      env: auditEnvironment(),
      observed_at: "2026-09-01T19:01:00.000Z",
      gh_api: vi.fn(async (path: string) => invalidEventRunApi(path)),
      write_report: vi.fn(),
    });

    expect(result).toMatchObject({
      exit_code: 1,
      report: {
        schema_version: 1,
        status: "FAIL",
        failures: [{
          code: "workflow_run_event_invalid",
          detail: expect.any(String),
          workflow_run_id: 100,
          run_attempt: 1,
        }],
      },
    });
    expect(result.report.failures[0]).not.toHaveProperty("failure_code");
    expect(result.report.failures[0]).not.toHaveProperty("failure_detail");
  });
});