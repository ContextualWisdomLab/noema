const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const TASK_IDENTITY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9:._/-]{0,198}[A-Za-z0-9])?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ACTION_KIND_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FORBIDDEN_FIELD_PATTERN = /(?:^|_)(?:token|secret|private_key|password|authorization|cookie|chain_of_thought|hidden_reasoning)(?:$|_)/i;
const MAX_DETAIL_CHARS = 800;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalized(value) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedText(value) {
  const text = normalized(value).replace(/[\u0000-\u001f\u007f]/g, "");
  return text.length <= MAX_DETAIL_CHARS
    ? text
    : `${text.slice(0, MAX_DETAIL_CHARS - 1)}…`;
}

function addCheck(checks, failures, code, pass, detail) {
  const check = { code, pass, detail: boundedText(detail) };
  checks.push(check);
  if (!pass) failures.push({ code, detail: check.detail });
}

function findForbiddenField(value) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    for (const [key, nested] of Object.entries(current)) {
      if (FORBIDDEN_FIELD_PATTERN.test(key)) return key;
      if (nested !== null && typeof nested === "object") pending.push(nested);
    }
  }
  return null;
}

function validUtcTimestamp(value) {
  if (!UTC_TIMESTAMP_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validAction(action) {
  if (!isRecord(action)) return false;
  const resultingSha = normalized(action.resulting_sha);
  return TASK_IDENTITY_PATTERN.test(normalized(action.action_identity))
    && ACTION_KIND_PATTERN.test(normalized(action.action_kind))
    && action.target_repository === EXPECTED_REPOSITORY
    && TASK_IDENTITY_PATTERN.test(normalized(action.target_ref))
    && (!resultingSha || SHA_PATTERN.test(resultingSha));
}

function validDeferredLane(lane) {
  return isRecord(lane)
    && TASK_IDENTITY_PATTERN.test(normalized(lane.lane_identity))
    && REASON_CODE_PATTERN.test(normalized(lane.reason_code));
}

function validReason(value) {
  return REASON_CODE_PATTERN.test(normalized(value));
}

/**
 * Evaluate a retained external hourly-scheduler evidence record without
 * contacting or mutating the scheduler provider or GitHub.
 *
 * @param {unknown} rawEvidence untrusted parsed JSON evidence
 * @returns {{status: "PASS" | "FAIL", checks: Array<{code: string, pass: boolean, detail: string}>, failures: Array<{code: string, detail: string}>}}
 */
export function evaluateExternalSchedulerEvidence(rawEvidence) {
  const evidence = isRecord(rawEvidence) ? rawEvidence : {};
  const checks = [];
  const failures = [];

  addCheck(
    checks,
    failures,
    "schema_version_invalid",
    evidence.schema_version === 1,
    evidence.schema_version === 1
      ? "Evidence uses schema version 1."
      : "Evidence must use schema version 1.",
  );
  addCheck(
    checks,
    failures,
    "repository_mismatch",
    evidence.repository_full_name === EXPECTED_REPOSITORY,
    evidence.repository_full_name === EXPECTED_REPOSITORY
      ? `Evidence is bound to ${EXPECTED_REPOSITORY}.`
      : `Evidence must be bound to ${EXPECTED_REPOSITORY}.`,
  );

  const taskIdentity = normalized(evidence.scheduler_task_identity);
  addCheck(
    checks,
    failures,
    "scheduler_task_identity_invalid",
    TASK_IDENTITY_PATTERN.test(taskIdentity),
    TASK_IDENTITY_PATTERN.test(taskIdentity)
      ? "Scheduler task identity is present and bounded."
      : "Scheduler task identity is missing, malformed, overlong, or contains unsupported characters.",
  );
  addCheck(
    checks,
    failures,
    "prompt_sha256_invalid",
    SHA256_PATTERN.test(normalized(evidence.prompt_sha256)),
    SHA256_PATTERN.test(normalized(evidence.prompt_sha256))
      ? "Prompt digest is a lowercase SHA-256 value."
      : "Prompt digest must be exactly 64 lowercase hexadecimal characters.",
  );
  addCheck(
    checks,
    failures,
    "protected_main_sha_invalid",
    SHA_PATTERN.test(normalized(evidence.protected_main_sha)),
    SHA_PATTERN.test(normalized(evidence.protected_main_sha))
      ? "Protected-main identity is a full lowercase commit SHA."
      : "Protected-main identity must be exactly 40 lowercase hexadecimal characters.",
  );

  const scheduledAt = normalized(evidence.scheduled_at);
  const startedAt = normalized(evidence.started_at);
  const timestampsValid = validUtcTimestamp(scheduledAt) && validUtcTimestamp(startedAt);
  addCheck(
    checks,
    failures,
    "scheduler_timestamps_invalid",
    timestampsValid,
    timestampsValid
      ? "Scheduler timestamps are canonical UTC instants."
      : "Scheduler timestamps must be canonical millisecond-precision UTC instants.",
  );
  const timeOrderValid = timestampsValid && Date.parse(startedAt) >= Date.parse(scheduledAt);
  addCheck(
    checks,
    failures,
    "scheduler_time_order_invalid",
    timeOrderValid,
    timeOrderValid
      ? "Scheduler start is not earlier than its scheduled instant."
      : "Scheduler start must not precede its scheduled instant.",
  );

  addCheck(
    checks,
    failures,
    "generic_error_observed_invalid",
    typeof evidence.generic_error_observed === "boolean",
    typeof evidence.generic_error_observed === "boolean"
      ? "Generic-error observation is explicitly boolean."
      : "Generic-error observation must be explicitly boolean.",
  );

  if (evidence.generic_error_observed === true) {
    const recovery = isRecord(evidence.generic_error_recovery)
      ? evidence.generic_error_recovery
      : {};
    addCheck(
      checks,
      failures,
      "generic_error_task_refetch_missing",
      recovery.task_refetched === true,
      recovery.task_refetched === true
        ? "Scheduler task state was refetched after the generic error."
        : "Scheduler task state must be refetched after the generic error.",
    );
    addCheck(
      checks,
      failures,
      "generic_error_github_refetch_missing",
      recovery.github_refetched === true,
      recovery.github_refetched === true
        ? "GitHub live state was refetched after the generic error."
        : "GitHub live state must be refetched after the generic error.",
    );
    addCheck(
      checks,
      failures,
      "generic_error_hidden_code_invented",
      recovery.hidden_error_code_invented === false,
      recovery.hidden_error_code_invented === false
        ? "No hidden provider error code was invented."
        : "Generic scheduler failures must not be assigned an invented hidden provider error code.",
    );
    addCheck(
      checks,
      failures,
      "generic_error_repository_execution_not_resumed",
      recovery.repository_execution_resumed === true,
      recovery.repository_execution_resumed === true
        ? "Repository execution resumed after recovery."
        : "Repository execution must resume after generic-error recovery when a safe lane exists.",
    );
    addCheck(
      checks,
      failures,
      "generic_error_resumed_action_missing",
      TASK_IDENTITY_PATTERN.test(normalized(recovery.resumed_action_identity)),
      TASK_IDENTITY_PATTERN.test(normalized(recovery.resumed_action_identity))
        ? "Recovery is bound to a concrete resumed GitHub action identity."
        : "Recovery must identify the concrete GitHub action that resumed repository execution.",
    );
  }

  const safeLaneCount = evidence.safe_independent_lane_count;
  addCheck(
    checks,
    failures,
    "safe_independent_lane_count_invalid",
    Number.isSafeInteger(safeLaneCount) && safeLaneCount >= 0,
    Number.isSafeInteger(safeLaneCount) && safeLaneCount >= 0
      ? "Safe independent lane count is a non-negative safe integer."
      : "Safe independent lane count must be a non-negative safe integer.",
  );

  const actions = Array.isArray(evidence.github_actions_performed)
    ? evidence.github_actions_performed
    : [];
  addCheck(
    checks,
    failures,
    "github_actions_invalid",
    Array.isArray(evidence.github_actions_performed) && actions.every(validAction),
    Array.isArray(evidence.github_actions_performed) && actions.every(validAction)
      ? "Every retained GitHub action has bounded exact repository identity."
      : "GitHub actions must be an array of bounded exact Noema action identities.",
  );

  const actionIdentities = actions.map((action) => normalized(action?.action_identity));
  const actionKinds = actions.map((action) => normalized(action?.action_kind));
  const actionIdentitiesUnique = new Set(actionIdentities).size === actionIdentities.length;
  addCheck(
    checks,
    failures,
    "github_action_identity_duplicate",
    actionIdentitiesUnique,
    actionIdentitiesUnique
      ? "GitHub action identities are unique within the run."
      : "GitHub action identities must not be duplicated within one run.",
  );

  const twoLaneRequirementMet = !(Number.isSafeInteger(safeLaneCount) && safeLaneCount >= 2)
    || actions.length >= 2;
  addCheck(
    checks,
    failures,
    "work_conserving_action_count_insufficient",
    twoLaneRequirementMet,
    twoLaneRequirementMet
      ? "Action count satisfies the two-safe-lane continuation contract."
      : "At least two GitHub actions are required when at least two safe independent lanes existed.",
  );
  const materiallyDistinct = actions.length < 2 || new Set(actionKinds).size >= 2;
  addCheck(
    checks,
    failures,
    "materially_distinct_actions_missing",
    materiallyDistinct,
    materiallyDistinct
      ? "Multiple retained actions use materially distinct action kinds."
      : "Multiple retained actions must use at least two materially distinct action kinds.",
  );

  const deferredLanes = Array.isArray(evidence.deferred_lanes)
    ? evidence.deferred_lanes
    : [];
  addCheck(
    checks,
    failures,
    "deferred_lanes_invalid",
    Array.isArray(evidence.deferred_lanes) && deferredLanes.every(validDeferredLane),
    Array.isArray(evidence.deferred_lanes) && deferredLanes.every(validDeferredLane)
      ? "Deferred lanes retain bounded exact identities and reason codes."
      : "Deferred lanes must be a bounded array of exact lane identities and reason codes.",
  );

  const remainingReasons = Array.isArray(evidence.remaining_non_actionable_reasons)
    ? evidence.remaining_non_actionable_reasons
    : [];
  addCheck(
    checks,
    failures,
    "remaining_non_actionable_reasons_invalid",
    Array.isArray(evidence.remaining_non_actionable_reasons)
      && remainingReasons.every(validReason),
    Array.isArray(evidence.remaining_non_actionable_reasons)
      && remainingReasons.every(validReason)
      ? "Remaining lanes use bounded non-actionable reason codes."
      : "Remaining lanes must use bounded snake_case non-actionable reason codes.",
  );

  const exitSweepCount = evidence.exit_sweep_count;
  addCheck(
    checks,
    failures,
    "exit_sweep_count_invalid",
    Number.isSafeInteger(exitSweepCount) && exitSweepCount >= 0 && exitSweepCount <= 2,
    Number.isSafeInteger(exitSweepCount) && exitSweepCount >= 0 && exitSweepCount <= 2
      ? "Exit sweep count is a bounded safe integer."
      : "Exit sweep count must be an integer from zero through two.",
  );

  const terminationReason = normalized(evidence.termination_reason);
  const terminationReasonValid = terminationReason === "double_exit_sweep"
    || terminationReason === "invocation_budget_exhausted";
  addCheck(
    checks,
    failures,
    "termination_reason_invalid",
    terminationReasonValid,
    terminationReasonValid
      ? "Termination reason is an allowed fail-closed value."
      : "Termination reason must be double_exit_sweep or invocation_budget_exhausted.",
  );
  if (terminationReason === "double_exit_sweep") {
    addCheck(
      checks,
      failures,
      "exit_sweep_incomplete",
      exitSweepCount === 2,
      exitSweepCount === 2
        ? "Two fresh exit sweeps were retained."
        : "A normal exit requires exactly two fresh whole-repository sweeps.",
    );
  }
  if (terminationReason === "invocation_budget_exhausted") {
    const budgetDetail = normalized(evidence.budget_exhaustion_detail);
    const budgetDetailValid = budgetDetail.length > 0
      && budgetDetail.length <= MAX_DETAIL_CHARS
      && !/[\u0000-\u001f\u007f]/.test(budgetDetail);
    addCheck(
      checks,
      failures,
      "budget_exhaustion_detail_missing",
      budgetDetailValid,
      budgetDetailValid
        ? "Practical invocation-budget exhaustion has a bounded concrete explanation."
        : "Invocation-budget exhaustion requires a non-empty bounded explanation without control bytes.",
    );
  }

  const forbiddenField = findForbiddenField(evidence);
  addCheck(
    checks,
    failures,
    "forbidden_sensitive_field",
    forbiddenField === null,
    forbiddenField === null
      ? "Retained evidence contains no forbidden secret or hidden-reasoning field names."
      : "Retained evidence contains a forbidden secret or hidden-reasoning field name.",
  );

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    checks,
    failures,
  };
}
