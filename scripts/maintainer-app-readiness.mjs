#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  REQUIRED_API_PROBES,
  evaluateMaintainerAppReadiness,
} from "./lib/maintainer-app-readiness.mjs";

const MAX_ERROR_CHARS = 4_000;
const MAX_IDENTITY_CHARS = 200;
const MAX_GH_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_GH_REQUEST_MILLISECONDS = 20_000;
const expectedRepository = "ContextualWisdomLab/noema";
const defaultReportPath = "artifacts/operations/maintainer-app-readiness.json";
const defaultGovernancePath = "artifacts/governance/main-governance-audit.json";
const githubApiHeaders = [
  "-H",
  "Accept: application/vnd.github+json",
  "-H",
  "X-GitHub-Api-Version: 2022-11-28",
];

/** Remove control characters and truncate diagnostics before persistence. */
export function bound(value, limit = MAX_ERROR_CHARS) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

/**
 * Parse an identity value without silently normalizing hostile control bytes or
 * truncating a credential binding into a different GitHub identity.
 */
export function parseConfiguredIdentity(raw, label) {
  const source = String(raw ?? "");
  if (/[\u0000-\u001f\u007f]/.test(source)) {
    throw new Error(`${label} must not contain control characters.`);
  }
  const value = source.trim();
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  if (value.length > MAX_IDENTITY_CHARS) {
    throw new Error(`${label} must be at most ${MAX_IDENTITY_CHARS} characters.`);
  }
  return value;
}

function runGh(args) {
  const completed = spawnSync("gh", ["api", ...githubApiHeaders, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_GH_OUTPUT_BYTES,
    timeout: MAX_GH_REQUEST_MILLISECONDS,
    shell: false,
    env: {
      PATH: process.env.PATH,
      GH_TOKEN: process.env.GH_TOKEN,
      GH_HOST: "github.com",
    },
  });
  if (completed.error) {
    throw new Error(`GitHub CLI could not complete: ${bound(completed.error.message)}`);
  }
  if (completed.status !== 0) {
    const detail = completed.stderr || completed.stdout || `exit ${completed.status}`;
    throw new Error(`GitHub CLI request failed: ${bound(detail)}`);
  }
  return completed.stdout.trim();
}

function runGhJson(args, label) {
  const raw = runGh(args);
  if (!raw) throw new Error(`${label} returned an empty response.`);
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${bound(error.message)}`);
  }
}

function probeGh(args) {
  try {
    runGh(args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Flatten `gh api --paginate --slurp` output for the installation repository
 * endpoint. Each page is an object containing its own `repositories` array.
 */
export function flattenInstallationRepositoryPages(pages) {
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated installation repository response must be an array of pages.");
  }
  return pages.flatMap((page) => {
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      throw new TypeError("Each installation repository page must be an object.");
    }
    if (!Array.isArray(page.repositories)) {
      throw new TypeError("Each installation repository page must contain a repositories array.");
    }
    return page.repositories;
  });
}

/** Flatten active-rule pages without silently accepting malformed pagination. */
export function flattenGovernanceRulePages(pages) {
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated active main rules response must be an array of pages.");
  }
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) {
      throw new TypeError("Each active main rules page must be an array.");
    }
    return page;
  });
}

/**
 * Reduce a public GitHub user response to documented bounded identity fields.
 * Installation suspension is not inferred from fields absent from this schema.
 */
export function normalizeBotAccount(account) {
  const source = account && typeof account === "object" && !Array.isArray(account)
    ? account
    : {};
  return {
    login: bound(source.login, 200),
    type: bound(source.type, 100),
  };
}

/**
 * Normalize repository permission evidence without converting absence into a
 * negative administrator finding. Unknown admin state must remain unknown so
 * the evaluator fails closed instead of treating an omitted field as `false`.
 */
export function normalizeRepositoryPermissions(permissions) {
  const source = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? permissions
    : {};
  return {
    pull: source.pull === true,
    push: source.push === true,
    admin: typeof source.admin === "boolean" ? source.admin : null,
    maintain: source.maintain === true,
    triage: source.triage === true,
  };
}

/**
 * Retain the expected repository only when the effective token scope is exact.
 * Unexpected repository names remain in memory for policy evaluation but are
 * not persisted in buyer-facing evidence or summaries.
 */
export function retainedRepositoryScope(accessibleRepositories) {
  const repositories = Array.isArray(accessibleRepositories)
    ? accessibleRepositories
    : [];
  const repositoryNames = repositories.map((item) => bound(item?.full_name, 300));
  const exactScope = repositoryNames.length === 1 && repositoryNames[0] === expectedRepository;
  return {
    accessible_repository_count: repositoryNames.length,
    accessible_repositories: exactScope ? [expectedRepository] : [],
  };
}

function parsePositiveInteger(raw, label) {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${label} could not be read: ${bound(error.message)}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} contained invalid JSON: ${bound(error.message)}`);
  }
}

function writeReport(path, report) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return absolutePath;
}

function appendOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${String(value).replace(/[\r\n]/g, "")}\n`, "utf8");
  }
}

function appendSummary(report) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    "## Maintainer App readiness audit",
    "",
    `- Repository: \`${report.repository}\``,
    `- Maintainer App: \`${report.app_slug || "unknown"}\``,
    `- Maintainer installation id: \`${report.installation_id || "unknown"}\``,
    `- Reviewer App: \`${report.reviewer_app_slug || "unknown"}\``,
    `- Reviewer installation id: \`${report.reviewer_installation_id || "unknown"}\``,
    `- Reviewer bot: \`${report.reviewer_login || "unknown"}\``,
    `- Maintenance enabled: \`${report.maintenance_enabled}\``,
    `- Effective repository count: ${report.accessible_repository_count}`,
    `- Status: **${report.status}**`,
    `- Failures: ${report.failures.length}`,
  ];
  if (report.failures.length > 0) {
    lines.push("", "### Failures");
    for (const failure of report.failures) {
      lines.push(`- \`${failure.code}\`: ${bound(failure.detail, 800)}`);
    }
  }
  lines.push(
    "",
    "### Evidence boundary",
    "- This report proves the effective Maintainer token minted for this run and binds the configured reviewer login to the authenticated Reviewer App slug and installation identifier.",
    "- Active main rules are collected in this run and re-evaluated by the canonical governance evaluator; retained governance status is additional evidence, not live authority.",
    "- Unexpected repository names are not persisted; failed scope evidence retains only the effective repository count.",
    "- It does not prove the complete underlying App registrations, installation suspension, key ownership, or break-glass actors; those remain reviewed administrator evidence under issue #29.",
  );
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function collectEvidence({
  repository,
  appSlug,
  installationId,
  reviewerAppSlug,
  reviewerInstallationId,
  reviewerLogin,
  maintenanceEnabled,
  governancePath,
}) {
  const repositoryPages = runGhJson(
    ["--paginate", "--slurp", "installation/repositories?per_page=100"],
    "Installation repository pagination",
  );
  const accessibleRepositories = flattenInstallationRepositoryPages(repositoryPages).map((item) => ({
    full_name: bound(item?.full_name, 300),
  }));

  const maintainerLogin = `${appSlug}[bot]`;
  const maintainerAccount = normalizeBotAccount(runGhJson(
    [`users/${encodeURIComponent(maintainerLogin)}`],
    "Maintainer bot lookup",
  ));
  const reviewerAccount = normalizeBotAccount(runGhJson(
    [`users/${encodeURIComponent(reviewerLogin)}`],
    "Reviewer bot lookup",
  ));
  const repositoryMetadata = runGhJson(
    [`repos/${repository}`],
    "Repository metadata lookup",
  );
  const defaultBranch = bound(repositoryMetadata?.default_branch, 300);
  if (defaultBranch !== "main") {
    throw new Error(`Repository default branch must be main, received ${defaultBranch || "missing"}.`);
  }
  const commit = runGhJson(
    [`repos/${repository}/commits/${encodeURIComponent(defaultBranch)}`],
    "Default-branch commit lookup",
  );
  const headSha = bound(commit?.sha, 100);
  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error("Default-branch commit lookup did not provide a full SHA.");
  }

  const governancePages = runGhJson(
    ["--paginate", "--slurp", `repos/${repository}/rules/branches/main?per_page=100`],
    "Active main governance pagination",
  );
  const governanceRules = flattenGovernanceRulePages(governancePages);

  const apiProbes = {
    actions_read: probeGh([`repos/${repository}/actions/runs?per_page=1`]),
    checks_read: probeGh([`repos/${repository}/commits/${headSha}/check-runs?per_page=1`]),
    statuses_read: probeGh([`repos/${repository}/commits/${headSha}/statuses?per_page=1`]),
    pull_requests_read: probeGh([`repos/${repository}/pulls?state=open&per_page=1`]),
    contents_read: probeGh([`repos/${repository}/contents?ref=${encodeURIComponent(defaultBranch)}`]),
  };
  for (const probe of REQUIRED_API_PROBES) {
    if (!(probe in apiProbes)) throw new Error(`Internal error: missing required API probe ${probe}.`);
  }

  return {
    repository,
    installationId,
    appSlug,
    maintainerAccount,
    reviewerAppSlug,
    reviewerInstallationId,
    reviewerLogin,
    reviewerAccount,
    maintenanceEnabled,
    accessibleRepositories,
    repositoryPermissions: normalizeRepositoryPermissions(repositoryMetadata?.permissions),
    apiProbes,
    governanceRules,
    governanceReport: readJson(governancePath, "Main governance audit"),
    defaultBranch,
    headSha,
  };
}

function buildReport(evidence, evaluation) {
  const retainedScope = retainedRepositoryScope(evidence.accessibleRepositories);
  return {
    schema_version: 1,
    source: "github-app-effective-token-preflight",
    generated_at: new Date().toISOString(),
    repository: evidence.repository,
    installation_id: evidence.installationId,
    app_slug: evidence.appSlug,
    maintainer_bot_login: evidence.maintainerAccount.login,
    reviewer_app_slug: evidence.reviewerAppSlug,
    reviewer_installation_id: evidence.reviewerInstallationId,
    reviewer_login: evidence.reviewerLogin,
    maintenance_enabled: evidence.maintenanceEnabled,
    ...retainedScope,
    repository_permissions: evidence.repositoryPermissions,
    api_probes: evidence.apiProbes,
    governance_status: bound(evidence.governanceReport?.status, 100) || "missing",
    live_governance_rule_count: Array.isArray(evidence.governanceRules) ? evidence.governanceRules.length : 0,
    default_branch: evidence.defaultBranch,
    default_branch_head_sha: evidence.headSha,
    status: evaluation.status,
    checks: evaluation.checks,
    failures: evaluation.failures,
    limitations: [
      "The report proves the effective Maintainer token minted for this run and binds the configured reviewer login to authenticated Reviewer App action outputs.",
      "Active main rules are collected in this run and re-evaluated with the canonical governance policy; retained governance status cannot override a live failure.",
      "Unexpected repository names are not persisted when the effective installation scope is broader than ContextualWisdomLab/noema.",
      "The pinned token actions and explicit permission inputs are the effective permission boundaries for this workflow run.",
      "Complete App registration permissions, installation selection and suspension, key ownership, and break-glass actors remain reviewed administrator evidence under issue #29.",
    ],
  };
}

function collectionFailureReport(repository, error) {
  return {
    schema_version: 1,
    source: "github-app-effective-token-preflight",
    generated_at: new Date().toISOString(),
    repository: repository || "unknown",
    installation_id: null,
    app_slug: "",
    maintainer_bot_login: "",
    reviewer_app_slug: bound(process.env.NOEMA_REVIEWER_APP_SLUG, 200),
    reviewer_installation_id: null,
    reviewer_login: bound(process.env.NOEMA_REVIEWER_LOGIN, 200),
    maintenance_enabled: String(process.env.NOEMA_MAINTENANCE_ENABLED ?? "").trim() === "true",
    accessible_repository_count: 0,
    accessible_repositories: [],
    repository_permissions: {},
    api_probes: Object.fromEntries(REQUIRED_API_PROBES.map((probe) => [probe, false])),
    governance_status: "unknown",
    live_governance_rule_count: 0,
    default_branch: "",
    default_branch_head_sha: "",
    status: "FAIL",
    checks: [],
    failures: [{ code: "collection_failed", detail: bound(error?.message || error) }],
    limitations: [
      "Collection failed before effective-token readiness or reviewer credential binding could be established.",
      "No failure report is evidence that either underlying App registration is correctly configured.",
    ],
  };
}

/**
 * Collect, evaluate, persist, and expose the Maintainer preflight plus the
 * authenticated Reviewer App identity binding used by exact-head review gates.
 */
export function main() {
  const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
  const reportPath = String(process.env.NOEMA_MAINTAINER_READINESS_PATH ?? defaultReportPath).trim()
    || defaultReportPath;
  const governancePath = String(process.env.NOEMA_GOVERNANCE_AUDIT_PATH ?? defaultGovernancePath).trim()
    || defaultGovernancePath;
  let report;
  try {
    if (repository !== expectedRepository) {
      throw new Error(`GITHUB_REPOSITORY must equal ${expectedRepository}.`);
    }
    if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN is required.");
    const appSlug = parseConfiguredIdentity(
      process.env.NOEMA_MAINTAINER_APP_SLUG,
      "NOEMA_MAINTAINER_APP_SLUG",
    );
    const installationId = parsePositiveInteger(
      process.env.NOEMA_MAINTAINER_INSTALLATION_ID,
      "NOEMA_MAINTAINER_INSTALLATION_ID",
    );
    const reviewerAppSlug = parseConfiguredIdentity(
      process.env.NOEMA_REVIEWER_APP_SLUG,
      "NOEMA_REVIEWER_APP_SLUG",
    );
    const reviewerInstallationId = parsePositiveInteger(
      process.env.NOEMA_REVIEWER_INSTALLATION_ID,
      "NOEMA_REVIEWER_INSTALLATION_ID",
    );
    const reviewerLogin = parseConfiguredIdentity(
      process.env.NOEMA_REVIEWER_LOGIN,
      "NOEMA_REVIEWER_LOGIN",
    );
    const maintenanceEnabled = String(process.env.NOEMA_MAINTENANCE_ENABLED ?? "").trim() === "true";
    const evidence = collectEvidence({
      repository,
      appSlug,
      installationId,
      reviewerAppSlug,
      reviewerInstallationId,
      reviewerLogin,
      maintenanceEnabled,
      governancePath,
    });
    report = buildReport(evidence, evaluateMaintainerAppReadiness(evidence));
  } catch (error) {
    report = collectionFailureReport(repository, error);
  }

  const absoluteReportPath = writeReport(reportPath, report);
  appendOutput("maintainer_app_readiness_status", report.status);
  appendOutput("maintainer_app_readiness_report_path", absoluteReportPath);
  appendSummary(report);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) main();
