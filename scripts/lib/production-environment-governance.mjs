const MAX_IDENTIFIER_CHARS = 200;

function text(value) {
  return String(value ?? "").trim();
}

function bounded(value) {
  const valueText = text(value);
  return valueText.length <= MAX_IDENTIFIER_CHARS
    ? valueText
    : `${valueText.slice(0, MAX_IDENTIFIER_CHARS)}…`;
}

function normalizeReviewer(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const type = text(entry.type);
  const reviewer = entry.reviewer;
  const id = Number(reviewer?.id);
  if (!new Set(["User", "Team"]).has(type) || !Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  const identifier = bounded(
    type === "User"
      ? reviewer?.login || reviewer?.name
      : reviewer?.slug || reviewer?.name,
  );
  if (!identifier) {
    return null;
  }
  return { type, id, identifier };
}

function check(name, pass, detail) {
  return { name, pass, detail };
}

function failure(code, detail) {
  return { code, detail };
}

export function evaluateProductionEnvironment(environment) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    return {
      status: "FAIL",
      reviewer_count: 0,
      reviewers: [],
      checks: [],
      failures: [failure("environment_response_invalid", "GitHub environment response must be a JSON object.")],
    };
  }

  const rules = Array.isArray(environment.protection_rules)
    ? environment.protection_rules.filter((rule) => rule && typeof rule === "object" && !Array.isArray(rule))
    : [];
  const reviewerRule = rules.find((rule) => rule.type === "required_reviewers");
  const branchRule = rules.find((rule) => rule.type === "branch_policy");
  const reviewers = Array.isArray(reviewerRule?.reviewers)
    ? reviewerRule.reviewers.map(normalizeReviewer).filter(Boolean)
    : [];
  const branchPolicy = environment.deployment_branch_policy;

  const checks = [
    check(
      "environment name is production",
      environment.name === "production",
      `observed=${bounded(environment.name) || "missing"}`,
    ),
    check(
      "required reviewers rule exists",
      Boolean(reviewerRule),
      `rule_count=${rules.filter((rule) => rule.type === "required_reviewers").length}`,
    ),
    check(
      "required reviewers are concrete identities",
      reviewers.length > 0,
      `reviewer_count=${reviewers.length}`,
    ),
    check(
      "deployment initiator cannot self-approve",
      reviewerRule?.prevent_self_review === true,
      `prevent_self_review=${String(reviewerRule?.prevent_self_review ?? "missing")}`,
    ),
    check(
      "branch policy rule exists",
      Boolean(branchRule),
      `rule_count=${rules.filter((rule) => rule.type === "branch_policy").length}`,
    ),
    check(
      "only protected branches may deploy",
      branchPolicy?.protected_branches === true,
      `protected_branches=${String(branchPolicy?.protected_branches ?? "missing")}`,
    ),
    check(
      "custom branch policy is disabled",
      branchPolicy?.custom_branch_policies === false,
      `custom_branch_policies=${String(branchPolicy?.custom_branch_policies ?? "missing")}`,
    ),
  ];

  const failures = [];
  if (environment.name !== "production") {
    failures.push(failure(
      "environment_name_mismatch",
      `GitHub environment must be production, observed ${bounded(environment.name) || "missing"}.`,
    ));
  }
  if (!reviewerRule) {
    failures.push(failure(
      "required_reviewers_rule_missing",
      "Production must define a required_reviewers protection rule.",
    ));
  }
  if (reviewers.length === 0) {
    failures.push(failure(
      "required_reviewers_empty",
      "Production must name at least one concrete User or Team deployment reviewer.",
    ));
  }
  if (reviewerRule?.prevent_self_review !== true) {
    failures.push(failure(
      "self_review_not_prevented",
      "Production deployment initiators must be prevented from approving their own deployment.",
    ));
  }
  if (!branchRule) {
    failures.push(failure(
      "branch_policy_rule_missing",
      "Production must define a branch_policy protection rule.",
    ));
  }
  if (branchPolicy?.protected_branches !== true) {
    failures.push(failure(
      "protected_branches_not_required",
      "Production deployment policy must require protected branches.",
    ));
  }
  if (branchPolicy?.custom_branch_policies !== false) {
    failures.push(failure(
      "custom_branch_policy_enabled",
      "Production must not replace protected-branch enforcement with custom branch patterns.",
    ));
  }

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    reviewer_count: reviewers.length,
    reviewers,
    checks,
    failures,
  };
}
