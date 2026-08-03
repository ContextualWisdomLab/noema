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
const acceptedOptionalConclusions = new Set(["success", "neutral", "skipped"]);
const reviewDependentCheckNames = new Set(REVIEW_DEPENDENT_CHECK_NAMES);
const reviewDispatchReasonCodes = new Set([
  "noema_current_head_approval_missing",
  "review_dependent_check_pending",
]);
const fullShaPattern = /^[0-9a-f]{40}$/i;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return String(value ?? "").trim();
}

function addReason(reasons, code, detail) {
  reasons.push({ code, detail });
}

function isTrustedGitHubActionsCheck(check) {
  return normalized(check?.appSlug).toLowerCase() === TRUSTED_GITHUB_ACTIONS_APP_SLUG;
}

function validatePullRequestIdentity(snapshot, reasons) {
  if (normalized(snapshot.state).toLowerCase() !== "open") {
    addReason(reasons, "pr_not_open", `Pull request state is ${normalized(snapshot.state) || "missing"}.`);
  }
  if (snapshot.draft !== false) {
    addReason(reasons, "pr_is_draft", "Pull request is draft or its draft state is unknown.");
  }
  if (normalized(snapshot.baseRef) !== "main") {
    addReason(
      reasons,
      "base_branch_not_main",
      `Pull request base is ${normalized(snapshot.baseRef) || "missing"}, not main.`,
    );
  }
  if (normalized(snapshot.headRepository) !== normalized(snapshot.repository)) {
    addReason(
      reasons,
      "head_repository_mismatch",
      `Head repository ${normalized(snapshot.headRepository) || "missing"} does not match ${normalized(snapshot.repository) || "missing"}.`,
    );
  }
  if (!fullShaPattern.test(normalized(snapshot.headSha))) {
    addReason(reasons, "invalid_head_sha", "Pull request head SHA is not a full 40-character hexadecimal SHA.");
  }
  if (snapshot.mergeable !== true) {
    addReason(reasons, "mergeable_not_true", "GitHub has not confirmed that the pull request is mergeable.");
  }
  if (normalized(snapshot.mergeableState).toLowerCase() !== "clean") {
    addReason(
      reasons,
      "merge_state_not_clean",
      `GitHub mergeable_state is ${normalized(snapshot.mergeableState) || "missing"}, not clean.`,
    );
  }
}

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

  const noemaDecision = normalized(snapshot.noemaReviewDecision).toLowerCase();
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

function validateRequiredChecks(checkRuns, reasons) {
  for (const requiredName of REQUIRED_CHECK_NAMES) {
    const matches = checkRuns.filter(
      (check) => normalized(check?.name) === requiredName && isTrustedGitHubActionsCheck(check),
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
      const status = normalized(check.status).toLowerCase();
      const conclusion = normalized(check.conclusion).toLowerCase();
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

function validateObservedChecks(checkRuns, reasons) {
  const requiredNames = new Set(REQUIRED_CHECK_NAMES);
  for (const check of checkRuns) {
    const name = normalized(check?.name);
    if (!name) {
      continue;
    }
    const trustedActionsCheck = isTrustedGitHubActionsCheck(check);
    if (requiredNames.has(name) && trustedActionsCheck) {
      continue;
    }
    const status = normalized(check?.status).toLowerCase();
    const conclusion = normalized(check?.conclusion).toLowerCase();
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

function validateChecks(snapshot, reasons) {
  const checkRuns = asArray(snapshot.checkRuns);
  validateRequiredChecks(checkRuns, reasons);
  validateObservedChecks(checkRuns, reasons);

  for (const statusContext of asArray(snapshot.statuses)) {
    const context = normalized(statusContext?.context) || "unnamed status";
    const state = normalized(statusContext?.state).toLowerCase();
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
