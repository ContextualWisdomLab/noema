export const REQUIRED_MAIN_CHECK_NAMES = Object.freeze([
  "verify",
  "reviewer",
  "scorecard",
  "osv-scan",
  "trivy-fs",
  "dependency-review",
]);

function normalized(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function ruleParameters(rule) {
  return rule?.parameters && typeof rule.parameters === "object"
    ? rule.parameters
    : {};
}

function addCheck(checks, failures, code, pass, detail) {
  const check = { code, pass, detail };
  checks.push(check);
  if (!pass) {
    failures.push({ code, detail });
  }
}

function rulesOfType(rules, type) {
  return rules.filter((rule) => normalized(rule?.type) === type);
}

function observedWorkflowControls(rules) {
  return rulesOfType(rules, "workflows").flatMap((rule) => {
    const workflows = ruleParameters(rule).workflows;
    if (!Array.isArray(workflows)) {
      return [];
    }
    return workflows.map((workflow) => ({
      repository_id: positiveInteger(workflow?.repository_id)
        ? workflow.repository_id
        : null,
      path: normalized(workflow?.path) || "unknown",
      ref: normalized(workflow?.ref) || "unknown",
      ruleset_id: positiveInteger(rule?.ruleset_id) ? rule.ruleset_id : null,
      ruleset_source_type: normalized(rule?.ruleset_source_type) || "unknown",
      ruleset_source: normalized(rule?.ruleset_source) || "unknown",
    }));
  });
}

export function evaluateMainGovernanceRules(rules) {
  const checks = [];
  const failures = [];
  if (!Array.isArray(rules)) {
    addCheck(
      checks,
      failures,
      "rules_response_invalid",
      false,
      "Active main rules must be supplied as an array.",
    );
    return {
      status: "FAIL",
      checks,
      failures,
      observed_controls: { required_workflows: [] },
    };
  }

  const pullRequestRules = rulesOfType(rules, "pull_request");
  const statusRules = rulesOfType(rules, "required_status_checks");
  const nonFastForwardRules = rulesOfType(rules, "non_fast_forward");
  const deletionRules = rulesOfType(rules, "deletion");

  addCheck(
    checks,
    failures,
    "pull_request_rule_missing",
    pullRequestRules.length > 0,
    pullRequestRules.length > 0
      ? `${pullRequestRules.length} active pull-request rule(s) apply to main.`
      : "No active pull-request rule applies to main.",
  );
  addCheck(
    checks,
    failures,
    "required_status_checks_rule_missing",
    statusRules.length > 0,
    statusRules.length > 0
      ? `${statusRules.length} active required-status rule(s) apply to main.`
      : "No active required-status-check rule applies to main.",
  );
  addCheck(
    checks,
    failures,
    "non_fast_forward_rule_missing",
    nonFastForwardRules.length > 0,
    nonFastForwardRules.length > 0
      ? "Force pushes are blocked by an active non-fast-forward rule."
      : "No active non-fast-forward rule blocks force pushes to main.",
  );
  addCheck(
    checks,
    failures,
    "deletion_rule_missing",
    deletionRules.length > 0,
    deletionRules.length > 0
      ? "Main deletion is restricted by an active deletion rule."
      : "No active deletion rule protects main.",
  );

  const dismissStaleReviews = pullRequestRules.some(
    (rule) => ruleParameters(rule).dismiss_stale_reviews_on_push === true,
  );
  addCheck(
    checks,
    failures,
    "dismiss_stale_reviews_disabled",
    dismissStaleReviews,
    dismissStaleReviews
      ? "At least one active pull-request rule dismisses stale approvals on push."
      : "Active pull-request rules do not dismiss stale approvals on push.",
  );

  const independentApprovalRequired = pullRequestRules.some((rule) =>
    positiveInteger(ruleParameters(rule).required_approving_review_count),
  );
  addCheck(
    checks,
    failures,
    "independent_approval_not_required",
    independentApprovalRequired,
    independentApprovalRequired
      ? "At least one active pull-request rule requires an approving review."
      : "Active pull-request rules do not require at least one approving review.",
  );

  const resolveThreads = pullRequestRules.some(
    (rule) => ruleParameters(rule).required_review_thread_resolution === true,
  );
  addCheck(
    checks,
    failures,
    "review_thread_resolution_disabled",
    resolveThreads,
    resolveThreads
      ? "Active pull-request rules require review-thread resolution."
      : "Active pull-request rules do not require review-thread resolution.",
  );

  const squashAllowed = pullRequestRules.length > 0 && pullRequestRules.every((rule) => {
    const allowed = ruleParameters(rule).allowed_merge_methods;
    return Array.isArray(allowed) && allowed.includes("squash");
  });
  addCheck(
    checks,
    failures,
    "squash_merge_not_allowed",
    squashAllowed,
    squashAllowed
      ? "Every active pull-request rule permits squash merge."
      : "At least one active pull-request rule does not permit squash merge.",
  );

  const strictStatusPolicy = statusRules.some(
    (rule) => ruleParameters(rule).strict_required_status_checks_policy === true,
  );
  addCheck(
    checks,
    failures,
    "strict_status_policy_disabled",
    strictStatusPolicy,
    strictStatusPolicy
      ? "At least one active status rule requires checks against the latest base."
      : "Active status rules do not require checks against the latest base.",
  );

  const requiredStatusEntries = statusRules.flatMap((rule) => {
    const entries = ruleParameters(rule).required_status_checks;
    return Array.isArray(entries) ? entries : [];
  });
  for (const context of REQUIRED_MAIN_CHECK_NAMES) {
    const matchingEntries = requiredStatusEntries.filter(
      (entry) => normalized(entry?.context) === context,
    );
    addCheck(
      checks,
      failures,
      "required_status_context_missing",
      matchingEntries.length > 0,
      matchingEntries.length > 0
        ? `Required status context ${context} is enforced for main.`
        : `Required status context ${context} is not enforced for main.`,
    );
    for (const entry of matchingEntries) {
      const pinned = positiveInteger(entry?.integration_id);
      addCheck(
        checks,
        failures,
        "required_status_source_unpinned",
        pinned,
        pinned
          ? `Required status context ${context} is pinned to integration ${entry.integration_id}.`
          : `Required status context ${context} has a missing or invalid integration_id.`,
      );
    }
  }

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    checks,
    failures,
    observed_controls: {
      required_workflows: observedWorkflowControls(rules),
    },
  };
}
