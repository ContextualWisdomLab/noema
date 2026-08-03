export const REQUIRED_API_PROBES = Object.freeze([
  "actions_read",
  "checks_read",
  "statuses_read",
  "pull_requests_read",
  "contents_read",
]);

const repositoryPattern = /^ContextualWisdomLab\/[A-Za-z0-9_.-]+$/;
const appSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const botLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?\[bot\]$/;

function normalized(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function addCheck(checks, failures, code, pass, detail) {
  const check = { code, pass, detail };
  checks.push(check);
  if (!pass) {
    failures.push({ code, detail });
  }
}

function validateIdentity(evidence, checks, failures) {
  const repository = normalized(evidence.repository);
  const installationId = evidence.installationId;
  const appSlug = normalized(evidence.appSlug);
  const maintainerAccount = asObject(evidence.maintainerAccount);
  const reviewerLogin = normalized(evidence.reviewerLogin);
  const reviewerAccount = asObject(evidence.reviewerAccount);
  const expectedMaintainerLogin = appSlug ? `${appSlug}[bot]` : "";

  addCheck(
    checks,
    failures,
    "repository_invalid",
    repositoryPattern.test(repository),
    repositoryPattern.test(repository)
      ? `Repository ${repository} is within ContextualWisdomLab.`
      : "Repository must identify a ContextualWisdomLab repository.",
  );
  addCheck(
    checks,
    failures,
    "installation_id_invalid",
    positiveInteger(installationId),
    positiveInteger(installationId)
      ? `Maintainer App installation id ${installationId} is valid.`
      : "Maintainer App installation id must be a positive integer.",
  );
  addCheck(
    checks,
    failures,
    "app_slug_invalid",
    appSlugPattern.test(appSlug),
    appSlugPattern.test(appSlug)
      ? `Maintainer App slug ${appSlug} is valid.`
      : "Maintainer App slug is missing or malformed.",
  );

  const maintainerLogin = normalized(maintainerAccount.login);
  addCheck(
    checks,
    failures,
    "maintainer_login_mismatch",
    Boolean(expectedMaintainerLogin) && maintainerLogin === expectedMaintainerLogin,
    maintainerLogin === expectedMaintainerLogin && expectedMaintainerLogin
      ? `Maintainer bot login matches ${expectedMaintainerLogin}.`
      : `Maintainer bot login ${maintainerLogin || "missing"} does not match ${expectedMaintainerLogin || "the App slug"}.`,
  );
  addCheck(
    checks,
    failures,
    "maintainer_type_invalid",
    normalized(maintainerAccount.type) === "Bot",
    normalized(maintainerAccount.type) === "Bot"
      ? "Maintainer identity is a GitHub Bot account."
      : `Maintainer identity type is ${normalized(maintainerAccount.type) || "missing"}, not Bot.`,
  );
  addCheck(
    checks,
    failures,
    "maintainer_account_suspended",
    maintainerAccount.suspended === false,
    maintainerAccount.suspended === false
      ? "Maintainer bot account is not suspended."
      : "Maintainer bot account is suspended or its suspension state is unknown.",
  );

  addCheck(
    checks,
    failures,
    "reviewer_login_invalid",
    botLoginPattern.test(reviewerLogin),
    botLoginPattern.test(reviewerLogin)
      ? `Configured reviewer login ${reviewerLogin} is an exact bot login.`
      : "Configured reviewer login must be a complete GitHub App bot login ending in [bot].",
  );
  const observedReviewerLogin = normalized(reviewerAccount.login);
  addCheck(
    checks,
    failures,
    "reviewer_login_mismatch",
    Boolean(reviewerLogin) && observedReviewerLogin === reviewerLogin,
    observedReviewerLogin === reviewerLogin && reviewerLogin
      ? `Reviewer API identity matches ${reviewerLogin}.`
      : `Reviewer API identity ${observedReviewerLogin || "missing"} does not match ${reviewerLogin || "the configured reviewer"}.`,
  );
  addCheck(
    checks,
    failures,
    "reviewer_type_invalid",
    normalized(reviewerAccount.type) === "Bot",
    normalized(reviewerAccount.type) === "Bot"
      ? "Reviewer identity is a GitHub Bot account."
      : `Reviewer identity type is ${normalized(reviewerAccount.type) || "missing"}, not Bot.`,
  );
  addCheck(
    checks,
    failures,
    "reviewer_account_suspended",
    reviewerAccount.suspended === false,
    reviewerAccount.suspended === false
      ? "Reviewer bot account is not suspended."
      : "Reviewer bot account is suspended or its suspension state is unknown.",
  );
  addCheck(
    checks,
    failures,
    "app_identity_not_separated",
    Boolean(maintainerLogin && reviewerLogin) && maintainerLogin !== reviewerLogin,
    maintainerLogin && reviewerLogin && maintainerLogin !== reviewerLogin
      ? "Maintainer and reviewer bot identities are distinct."
      : "Maintainer and reviewer bot identities must be distinct.",
  );
}

function validateRepositoryScope(evidence, checks, failures) {
  const repository = normalized(evidence.repository);
  const accessibleRepositories = Array.isArray(evidence.accessibleRepositories)
    ? evidence.accessibleRepositories
    : [];
  const repositoryNames = accessibleRepositories.map((item) => normalized(item?.full_name));
  const exactScope = repositoryNames.length === 1 && repositoryNames[0] === repository;
  addCheck(
    checks,
    failures,
    "repository_scope_invalid",
    exactScope,
    exactScope
      ? `Effective installation token is scoped only to ${repository}.`
      : `Effective installation token repositories are ${repositoryNames.filter(Boolean).join(", ") || "none"}; expected only ${repository || "the target repository"}.`,
  );

  const permissions = asObject(evidence.repositoryPermissions);
  addCheck(
    checks,
    failures,
    "repository_pull_missing",
    permissions.pull === true,
    permissions.pull === true
      ? "Effective token can read repository contents and metadata."
      : "Effective token does not report pull access.",
  );
  addCheck(
    checks,
    failures,
    "repository_push_missing",
    permissions.push === true,
    permissions.push === true
      ? "Effective token reports repository push access required for the scoped write workflow."
      : "Effective token does not report push access.",
  );
  addCheck(
    checks,
    failures,
    "repository_admin_present",
    permissions.admin === false,
    permissions.admin === false
      ? "Effective token does not have repository administrator access."
      : "Effective token has administrator access or its administrator state is unknown.",
  );
}

function validateApiProbes(evidence, checks, failures) {
  const probes = asObject(evidence.apiProbes);
  for (const probe of REQUIRED_API_PROBES) {
    const pass = probes[probe] === true;
    addCheck(
      checks,
      failures,
      "api_probe_failed",
      pass,
      pass
        ? `Required GitHub API probe ${probe} passed.`
        : `Required GitHub API probe ${probe} did not pass.`,
    );
  }
}

function validateGovernance(evidence, checks, failures) {
  const governance = evidence.governanceReport;
  const validObject = governance && typeof governance === "object" && !Array.isArray(governance);
  addCheck(
    checks,
    failures,
    "governance_report_invalid",
    Boolean(validObject),
    validObject
      ? "Main governance audit report is present."
      : "Main governance audit report is missing or malformed.",
  );
  if (!validObject) {
    return;
  }

  const repository = normalized(evidence.repository);
  const governanceRepository = normalized(governance.repository);
  addCheck(
    checks,
    failures,
    "governance_repository_mismatch",
    governanceRepository === repository,
    governanceRepository === repository
      ? `Governance evidence is bound to ${repository}.`
      : `Governance evidence repository ${governanceRepository || "missing"} does not match ${repository || "the target repository"}.`,
  );
  const branch = normalized(governance.branch);
  addCheck(
    checks,
    failures,
    "governance_branch_mismatch",
    branch === "main",
    branch === "main"
      ? "Governance evidence is bound to main."
      : `Governance evidence branch is ${branch || "missing"}, not main.`,
  );
  const status = normalized(governance.status).toUpperCase();
  addCheck(
    checks,
    failures,
    "governance_status_not_pass",
    status === "PASS",
    status === "PASS"
      ? "Live main governance audit passed."
      : `Live main governance audit status is ${status || "missing"}, not PASS.`,
  );
}

export function evaluateMaintainerAppReadiness(evidence = {}) {
  const checks = [];
  const failures = [];
  validateIdentity(evidence, checks, failures);
  validateRepositoryScope(evidence, checks, failures);
  validateApiProbes(evidence, checks, failures);
  validateGovernance(evidence, checks, failures);
  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    checks,
    failures,
  };
}
