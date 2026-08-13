import { evaluateMainGovernanceRules } from "./main-governance-audit.mjs";

export const REQUIRED_API_PROBES = Object.freeze([
  "actions_read",
  "checks_read",
  "statuses_read",
  "pull_requests_read",
  "contents_read",
]);

const MAX_DETAIL_CHARS = 800;
const expectedRepository = "ContextualWisdomLab/noema";
const appSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const botLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?\[bot\]$/;

function normalized(value) {
  return String(value ?? "").trim();
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeDetail(value) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return text.length <= MAX_DETAIL_CHARS
    ? text
    : `${text.slice(0, MAX_DETAIL_CHARS - 1)}…`;
}

function addCheck(checks, failures, code, pass, detail) {
  const retainedDetail = safeDetail(detail);
  const check = { code, pass, detail: retainedDetail };
  checks.push(check);
  if (!pass) failures.push({ code, detail: retainedDetail });
}

function validateIdentity(evidence, checks, failures) {
  const repository = normalized(evidence.repository);
  const installationId = evidence.installationId;
  const appSlug = normalized(evidence.appSlug);
  const maintainerAccount = objectValue(evidence.maintainerAccount);
  const reviewerAppSlug = normalized(evidence.reviewerAppSlug);
  const reviewerInstallationId = evidence.reviewerInstallationId;
  const reviewerLogin = normalized(evidence.reviewerLogin);
  const reviewerAccount = objectValue(evidence.reviewerAccount);
  const expectedMaintainerLogin = appSlug ? `${appSlug}[bot]` : "";
  const expectedReviewerLogin = reviewerAppSlug ? `${reviewerAppSlug}[bot]` : "";
  const maintainerLogin = normalized(maintainerAccount.login);
  const observedReviewerLogin = normalized(reviewerAccount.login);

  addCheck(
    checks,
    failures,
    "repository_mismatch",
    repository === expectedRepository,
    repository === expectedRepository
      ? `Evidence is bound to ${expectedRepository}.`
      : `Evidence repository ${repository || "missing"} does not match ${expectedRepository}.`,
  );
  addCheck(
    checks,
    failures,
    "maintenance_already_enabled",
    evidence.maintenanceEnabled === false,
    evidence.maintenanceEnabled === false
      ? "Automated maintenance remains disabled during pre-activation audit."
      : "NOEMA_MAINTENANCE_ENABLED must remain disabled until pre-activation evidence and independent approval pass.",
  );
  addCheck(
    checks,
    failures,
    "installation_id_invalid",
    Number.isSafeInteger(installationId) && installationId > 0,
    Number.isSafeInteger(installationId) && installationId > 0
      ? `Installation id ${installationId} is a positive integer.`
      : "Installation id must be a positive safe integer.",
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
    "reviewer_installation_id_invalid",
    Number.isSafeInteger(reviewerInstallationId) && reviewerInstallationId > 0,
    Number.isSafeInteger(reviewerInstallationId) && reviewerInstallationId > 0
      ? `Reviewer installation id ${reviewerInstallationId} is a positive integer.`
      : "Reviewer installation id must be a positive safe integer.",
  );
  addCheck(
    checks,
    failures,
    "reviewer_app_slug_invalid",
    appSlugPattern.test(reviewerAppSlug),
    appSlugPattern.test(reviewerAppSlug)
      ? `Reviewer App slug ${reviewerAppSlug} is valid.`
      : "Reviewer App slug is missing or malformed.",
  );
  addCheck(
    checks,
    failures,
    "reviewer_app_login_mismatch",
    Boolean(expectedReviewerLogin) && reviewerLogin === expectedReviewerLogin,
    reviewerLogin === expectedReviewerLogin && expectedReviewerLogin
      ? `Configured reviewer login is bound to authenticated Reviewer App ${reviewerAppSlug}.`
      : `Configured reviewer login ${reviewerLogin || "missing"} does not match ${expectedReviewerLogin || "the authenticated Reviewer App slug"}.`,
  );
  addCheck(
    checks,
    failures,
    "reviewer_login_invalid",
    botLoginPattern.test(reviewerLogin),
    botLoginPattern.test(reviewerLogin)
      ? `Configured reviewer login ${reviewerLogin} is an exact bot login.`
      : "Configured reviewer login must end in [bot] and contain only supported GitHub login characters.",
  );
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
    "app_identity_not_separated",
    Boolean(maintainerLogin && reviewerLogin) && maintainerLogin !== reviewerLogin,
    maintainerLogin && reviewerLogin && maintainerLogin !== reviewerLogin
      ? "Maintainer and reviewer bot identities are distinct."
      : "Maintainer and reviewer bot identities must be distinct.",
  );
}

function validateRepositoryScope(evidence, checks, failures) {
  const accessibleRepositories = Array.isArray(evidence.accessibleRepositories)
    ? evidence.accessibleRepositories
    : [];
  const repositoryNames = accessibleRepositories.map((item) => normalized(item?.full_name));
  const exactScope = repositoryNames.length === 1 && repositoryNames[0] === expectedRepository;
  addCheck(
    checks,
    failures,
    "repository_scope_invalid",
    exactScope,
    exactScope
      ? `Effective token is scoped only to ${expectedRepository}.`
      : `Effective token reports ${repositoryNames.length} accessible repositories; expected exactly one repository scoped to ${expectedRepository}.`,
  );

  const permissions = objectValue(evidence.repositoryPermissions);
  addCheck(
    checks,
    failures,
    "repository_pull_missing",
    permissions.pull === true,
    permissions.pull === true
      ? "Effective token reports repository read access."
      : "Effective token does not report repository read access.",
  );
  addCheck(
    checks,
    failures,
    "repository_push_missing",
    permissions.push === true,
    permissions.push === true
      ? "Effective token reports the scoped write access required by the maintainer loop."
      : "Effective token does not report the scoped write access required by the maintainer loop.",
  );
  const adminStateKnown = typeof permissions.admin === "boolean";
  addCheck(
    checks,
    failures,
    "repository_admin_state_invalid",
    adminStateKnown,
    adminStateKnown
      ? "Repository administrator permission state is explicitly reported."
      : "Repository administrator permission state is missing or non-boolean.",
  );
  addCheck(
    checks,
    failures,
    "repository_admin_present",
    permissions.admin === false,
    permissions.admin === false
      ? "Effective token does not have repository administrator access."
      : permissions.admin === true
        ? "Effective token has repository administrator access."
        : "Administrator absence cannot be established from unknown permission evidence.",
  );
}

function validateApiProbes(evidence, checks, failures) {
  const probes = objectValue(evidence.apiProbes);
  for (const probe of REQUIRED_API_PROBES) {
    const pass = probes[probe] === true;
    addCheck(
      checks,
      failures,
      `api_probe_${probe}`,
      pass,
      pass
        ? `Required GitHub API probe ${probe} passed.`
        : `Required GitHub API probe ${probe} did not pass.`,
    );
  }
}

function validateGovernance(evidence, checks, failures) {
  const liveEvaluation = evaluateMainGovernanceRules(evidence.governanceRules);
  const livePass = liveEvaluation.status === "PASS";
  addCheck(
    checks,
    failures,
    "live_governance_not_pass",
    livePass,
    livePass
      ? "Fresh active main rules pass the canonical governance evaluator."
      : `Fresh active main rules failed canonical governance evaluation with ${liveEvaluation.failures.length} finding(s).`,
  );

  const governance = evidence.governanceReport;
  const valid = governance && typeof governance === "object" && !Array.isArray(governance);
  addCheck(
    checks,
    failures,
    "governance_report_invalid",
    Boolean(valid),
    valid ? "Main governance audit report is present." : "Main governance audit report is missing or malformed.",
  );
  if (!valid) return;

  addCheck(
    checks,
    failures,
    "governance_repository_mismatch",
    normalized(governance.repository) === expectedRepository,
    normalized(governance.repository) === expectedRepository
      ? `Governance evidence is bound to ${expectedRepository}.`
      : `Governance evidence repository ${normalized(governance.repository) || "missing"} does not match ${expectedRepository}.`,
  );
  addCheck(
    checks,
    failures,
    "governance_branch_mismatch",
    normalized(governance.branch) === "main",
    normalized(governance.branch) === "main"
      ? "Governance evidence is bound to main."
      : `Governance evidence branch is ${normalized(governance.branch) || "missing"}, not main.`,
  );
  const status = normalized(governance.status).toUpperCase();
  addCheck(
    checks,
    failures,
    "governance_status_not_pass",
    status === "PASS",
    status === "PASS"
      ? "Retained main governance audit report passed."
      : `Retained main governance audit status is ${status || "missing"}, not PASS.`,
  );
}

/**
 * Evaluate bounded, already-collected evidence for the Maintainer GitHub App.
 * The function is pure so tests and buyers can reproduce the decision without
 * network, filesystem, environment, or clock dependencies. Public GitHub user
 * responses are used only for exact login and account-type identity checks;
 * installation suspension is outside that endpoint's documented schema.
 */
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
