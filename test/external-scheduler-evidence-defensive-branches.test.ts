import { describe, expect, it } from "vitest";
import { evaluateExternalSchedulerEvidence } from "../scripts/lib/external-scheduler-evidence-audit.mjs";

const repository = "ContextualWisdomLab/noema";

function passingEvidence() {
  return {
    schema_version: 1,
    scheduler_task_identity: "chatgpt-task:noema-hourly-primary",
    prompt_sha256: "a".repeat(64),
    scheduled_at: "2026-08-10T11:00:00.000Z",
    started_at: "2026-08-10T11:00:05.000Z",
    repository_full_name: repository,
    protected_main_sha: "b".repeat(40),
    generic_error_observed: false,
    safe_independent_lane_count: 1,
    github_actions_performed: [
      {
        action_identity: "issue:96",
        action_kind: "issue_created",
        target_repository: repository,
        target_ref: "issues/96",
      },
    ],
    deferred_lanes: [],
    termination_reason: "double_exit_sweep",
    exit_sweep_count: 2,
    remaining_non_actionable_reasons: ["independent_approval_unavailable"],
  };
}

function failureCodes(result: ReturnType<typeof evaluateExternalSchedulerEvidence>) {
  return result.failures.map((failure) => failure.code);
}

describe("external scheduler evidence defensive branches", () => {
  it("rejects a non-object GitHub action entry", () => {
    const evidence = {
      ...passingEvidence(),
      github_actions_performed: ["not-an-action-object"],
    };

    expect(failureCodes(evaluateExternalSchedulerEvidence(evidence))).toContain(
      "github_actions_invalid",
    );
  });

  it("requires a recovery object when a generic error was observed", () => {
    const evidence: Record<string, unknown> = {
      ...passingEvidence(),
      generic_error_observed: true,
    };

    const codes = failureCodes(evaluateExternalSchedulerEvidence(evidence));

    expect(codes).toEqual(expect.arrayContaining([
      "generic_error_task_refetch_missing",
      "generic_error_github_refetch_missing",
      "generic_error_hidden_code_invented",
      "generic_error_repository_execution_not_resumed",
      "generic_error_resumed_action_missing",
    ]));
  });

  it("rejects regex-shaped but impossible UTC timestamps", () => {
    const evidence = {
      ...passingEvidence(),
      scheduled_at: "2026-99-99T99:99:99.999Z",
      started_at: "2026-99-99T99:99:99.999Z",
    };

    expect(failureCodes(evaluateExternalSchedulerEvidence(evidence))).toEqual(
      expect.arrayContaining([
        "scheduler_timestamps_invalid",
        "scheduler_time_order_invalid",
      ]),
    );
  });
});
