import { describe, expect, it } from "vitest";

import { evaluateExternalSchedulerEvidence } from "../scripts/lib/external-scheduler-evidence-audit.mjs";

function futureEvidence() {
  return {
    schema_version: 1,
    scheduler_task_identity: "chatgpt-task:noema-hourly-primary",
    prompt_sha256: "a".repeat(64),
    scheduled_at: "2999-08-22T13:00:00.000Z",
    started_at: "2999-08-22T13:00:05.000Z",
    repository_full_name: "ContextualWisdomLab/noema",
    protected_main_sha: "b".repeat(40),
    generic_error_observed: false,
    safe_independent_lane_count: 0,
    github_actions_performed: [],
    deferred_lanes: [],
    termination_reason: "double_exit_sweep",
    exit_sweep_count: 2,
    remaining_non_actionable_reasons: [],
  };
}

describe("external scheduler evidence time authority", () => {
  it("rejects scheduler evidence whose scheduled and started instants are still in the future", () => {
    const result = evaluateExternalSchedulerEvidence(futureEvidence());

    expect(result.status).toBe("FAIL");
    expect(result.failures.map((failure) => failure.code)).toContain(
      "scheduler_timestamp_future",
    );
  });
});
