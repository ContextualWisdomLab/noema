export const REQUIRED_CHECK_NAMES = Object.freeze([
  "verify",
  "reviewer",
  "scorecard",
  "osv-scan",
  "trivy-fs",
  "dependency-review",
]);

export const REVIEW_DEPENDENT_CHECK_NAMES = Object.freeze([
  "opencode-review",
  "metadata-only gate evaluation",
]);

const TRUSTED_GITHUB_ACTIONS_APP_SLUG = "github-actions";
const acceptedOptionalConclusions = new Set(["success"]);
const reviewDependentCheckNames = new Set(REVIEW_DEPENDENT_CHECK_NAMES);
const reviewDispatchReasonCodes = new Set([
  "noema_current_head_approval_missing",
  "review_dependent_check_pending",
]);
const fullShaPattern = /^[0-9a-f]{40}$/;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return String(value ?? "").trim();
}

/** Preserve authority-bearing API strings only when their serialization is already exact. */
function exactAuthorityString(value) {
  return typeof value === "string"
    && value.length > 0
    && value === value.trim()
    ? value
    : "";
}

/** Preserve check-name authority only when GitHub supplied an exact string identity. */
function exactCheckName(value) {
  return typeof value === "string" ? value : "";
}

function addReason(reasons, code, detail) {
  reasons.push({ code, detail });
}

/** Trust required-check producer authority only when the projected App slug is already canonical. */
function isTrustedGitHubActionsCheck(check) {
  return check?.appSlug === TRUSTED_GITHUB_ACTIONS_APP_SLUG;
}

/** Fail closed when the pull request identity tuple differs from the exact merge target authority. */
function validatePullRequestIdentity(snapshot, reasons) {
  const state = exactAuthorityString(snapshot.state);
  if (state !== "open") {
    addReason(reasons, "pr_not_open", `Pull request state is ${normalized(snapshot.state) || "missing"}.`);
  }
  if (snapshot.draft !== false) {
    addReason(reasons, "pr_is_draft", "Pull request is draft or its draft state is unknown.");
  }
  const baseRef = exactAuthorityString(snapshot.baseRef);
  if (baseRef !== "main") {
    addReason(
      reasons,
      "base_branch_not_main",
      `Pull request base is ${normalized(snapshot.baseRef) || "missing"}, not main.`,
    );
  }
  const repository = exactAuthorityString(snapshot.repository);
  const headRepository = exactAuthorityString(snapshot.headRepository);
  if (!repository || !headRepository || headRepository !== repository) {
    addReason(
      reasons,
      "head_repository_mismatch",
      `Head repository ${normalized(snapshot.headRepository) || "missing"} does not match ${normalized(snapshot.repository) || "missing"}.`,
    );
  }
  const headSha = exactAuthorityString(snapshot.headSha);
  if (!fullShaPattern.test(headSha)) {
    addReason(
      reasons,
      "invalid_head_sha",
      "Pull request head SHA must be the canonical lowercase 40-character hexadecimal identity.",
    );
  }
  if (snapshot.mergeable !== true) {
    addReason(reasons, "mergeable_not_true", "GitHub has not confirmed that the pull request is mergeable.");
  }
  const mergeableState = exactAuthorityString(snapshot.mergeableState);
  if (mergeableState !== "clean") {
    addReason(
      reasons,
      "merge_state_not_clean",
      `GitHub mergeable_state is ${normalized(snapshot.mergeableState) || "missing"}, not clean.`,
    );
  }
}

/** Require canonical review evidence and exact Noema decision tokens before granting merge authority. */
function validateReviews(snapshot, reasons) {
  const unresolvedThreadCount = Number(snapshot.unresolvedThreadCount);
  if (!Number.isInteger(unresolvedThreadCount) || unresolvedThreadCount < 0) {
    addReason(reasons, "review_thread_count_invalid", "Unresolved review-thread count is missing or invalid.");
  } else if (unresolvedThreadCount > 0) {
    addReason(
      reasons,
      "unresolved_review_threads",
      `${unresolvedThreadCount} unresolved review thread(s) remain.`,
    );
  }

  for (const review of asArray(snapshot.latestReviewStates)) {
    if (normalized(review?.state).toUpperCase() === "CHANGES_REQUESTED") {
      addReason(
        reasons,
        "review_changes_requested",
        `${normalized(review?.reviewer) || "unknown reviewer"} has an effective CHANGES_REQUESTED review.`,
      );
    }
  }

  const noemaDecision = exactAuthorityString(snapshot.noemaReviewDecision);
  if (!noemaDecision) {
    addReason(
      reasons,
      "noema_current_head_approval_missing",
      `No current-head Noema approval exists for ${normalized(snapshot.headSha) || "the current head"}.`,
    );
  } else if (noemaDecision !== "approve") {
    addReason(
      reasons,
      "noema_current_head_rejected",
      `Noema current-head decision is ${noemaDecision}.`,
    );
  }
}

/** Detect required-check name collisions before a noncanonical producer can satisfy check authority. */
function validateRequiredCheckProducers(checkRuns, reasons) {
  const requiredNames = new Set(REQUIRED_CHECK_NAMES);
  for (const check of checkRuns) {
    const name = exactCheckName(check?.name);
    if (!requiredNames.has(name) || isTrustedGitHubActionsCheck(check)) {
      continue;
    }
    addReason(
      reasons,
      "required_check_producer_collision",
      `Required check name ${name} was also produced by ${normalized(check?.appSlug) || "an unknown app"}.`,
    );
  }
}

/** Require every canonical check name to have current trusted evidence and a successful terminal result. */
function validateRequiredChecks(checkRuns, reasons) {
  for (const requiredName of REQUIRED_CHECK_NAMES) {
    const matches = checkRuns.filter(
      (check) => exactCheckName(check?.name) === requiredName && isTrustedGitHubActionsCheck(check),
    );
    if (matches.length === 0) {
      addReason(
        reasons,
        "required_check_missing",
        `Required check ${requiredName} is missing from the current head.`,
      );
      continue;
    }
    for (const check of matches) {
      const status = exactAuthorityString(check?.status);
      const conclusion = exactAuthorityString(check?.conclusion);
      if (status !== "completed") {
        addReason(
          reasons,
          "required_check_pending",
          `Required check ${requiredName} is ${status || "missing"}.`,
        );
      } else if (conclusion !== "success") {
        addReason(
          reasons,
          "required_check_failed",
          `Required check ${requiredName} concluded ${conclusion || "missing"}.`,
        );
      }
    }
  }
}

/** Retain non-required check evidence while keeping review-dependent and optional failures fail closed. */
function validateObservedChecks(checkRuns, reasons) {
  const requiredNames = new Set(REQUIRED_CHECK_NAMES);
  for (const check of checkRuns) {
    const name = exactCheckName(check?.name);
    if (!name) {
      continue;
    }
    const trustedActionsCheck = isTrustedGitHubActionsCheck(check);
    if (requiredNames.has(name)) {
      continue;
    }
    const status = exactAuthorityString(check?.status);
    const conclusion = exactAuthorityString(check?.conclusion);
    if (reviewDependentCheckNames.has(name) && trustedActionsCheck) {
      if (status !== "completed") {
        addReason(
          reasons,
          "review_dependent_check_pending",
          `Review-dependent check ${name} is ${status || "missing"}.`,
        );
      } else if (!acceptedOptionalConclusions.has(conclusion)) {
        addReason(
          reasons,
          "review_dependent_check_failed",
          `Review-dependent check ${name} concluded ${conclusion || "missing"}.`,
        );
      }
      continue;
    }
    if (status !== "completed") {
      addReason(
        reasons,
        "observed_check_pending",
        `Observed check ${name} is ${status || "missing"}.`,
      );
    } else if (!acceptedOptionalConclusions.has(conclusion)) {
      addReason(
        reasons,
        "observed_check_failed",
        `Observed check ${name} concluded ${conclusion || "missing"}.`,
      );
    }
  }
}

/** Require exact terminal check and commit-status evidence before any result can become merge authority. */
function validateChecks(snapshot, reasons) {
  const checkRuns = asArray(snapshot.checkRuns);
  validateRequiredCheckProducers(checkRuns, reasons);
  validateRequiredChecks(checkRuns, reasons);
  validateObservedChecks(checkRuns, reasons);

  for (const statusContext of asArray(snapshot.statuses)) {
    const context = normalized(statusContext?.context) || "unnamed status";
    const state = exactAuthorityString(statusContext?.state);
    if (state !== "success") {
      addReason(
        reasons,
        "status_not_success",
        `Status ${context} is ${state || "missing"}.`,
      );
    }
  }
}

export function evaluatePullRequest(snapshot = {}) {
  const reasons = [];
  validatePullRequestIdentity(snapshot, reasons);
  validateReviews(snapshot, reasons);
  validateChecks(snapshot, reasons);

  if (reasons.length === 0) {
    return { action: "merge", reasons };
  }
  const lacksNoemaApproval = reasons.some(
    (reason) => reason.code === "noema_current_head_approval_missing",
  );
  if (
    lacksNoemaApproval
    && reasons.every((reason) => reviewDispatchReasonCodes.has(reason.code))
  ) {
    return { action: "request_review", reasons };
  }
  return { action: "blocked", reasons };
}
