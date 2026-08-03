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
const MAX_GH_OUTPUT_BYTES = 4 * 1024 * 1024;
const repositoryPattern = /^ContextualWisdomLab\/[A-Za-z0-9_.-]+$/;
const defaultReportPath = "artifacts/operations/maintainer-app-readiness.json";
const defaultGovernancePath = "artifacts/governance/main-governance-audit.json";

export function bound(value, limit = MAX_ERROR_CHARS) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function runGh(args) {
  const completed = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: MAX_GH_OUTPUT_BYTES,
    shell: false,
  });
  if (completed.error) {
    throw new Error(`GitHub CLI could not start: ${bound(completed.error.message)}`);
  }
  if (completed.status !== 0) {
    const detail = completed.stderr || completed.stdout || `exit ${completed.status}`;
    throw new Error(`GitHub CLI failed: ${bound(detail)}`);
  }
  return completed.stdout.trim();
}

function runGhJson(args, label) {
  const raw = runGh(args);
  if (!raw) {
    throw new Error(`${label} returned an empty response.`);
  }
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

export function flattenArrayPages(pages) {
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated installation repository response must be an array of pages.");
  }
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) {
      throw new TypeError("Each installation repository page must be an array.");
    }
    return page;
  });
}

export function normalizeBotAccount(account) {
  const source = account && typeof account === "object" && !Array.isArray(account)
    ? account
    : {};
  return {
    login: bound(source.login, 200),
    type: bound(source.type, 100),
    suspended: source.suspended === true || Boolean(source.suspended_at),
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
  if (!summaryPath) {
    return;
  }
  const lines = [
    "## Maintainer App readiness audit",
    "",
    `- Repository: \`${report.repository}\``,
    `- Maintainer App: \`${report.app_slug || "unknown"}\``,
    `- Reviewer bot: \`${report.reviewer_login || "unknown"}\``,
    `- Installation id: \`${report.installation_id || "unknown"}\``,
    `- Effective repositories: ${report.accessible_repositories.length}`,
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
    "- This report proves the effective token used by this run, not the complete underlying App installation registration.",
    "- App registration permissions, installation selection, key ownership, and break-glass actors still require reviewed administrator evidence under issue #29.",
  );
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function collectEvidence({ repository, appSlug, installationId, reviewerLogin, governancePath }) {
  const repositoryPages = runGhJson(
    ["api", "--paginate", "--slurp", "installation/repositories?per_page=100"],
    "Installation repository pagination",
  );
  const accessibleRepositories = flattenArrayPages(repositoryPages).map((item) => ({
    full_name: bound(item?.full_name, 300),
  }));

  const maintainerLogin = `${appSlug}[bot]`;
  const maintainerAccount = normalizeBotAccount(runGhJson(
    ["api", `users/${encodeURIComponent(maintainerLogin)}`],
    "Maintainer bot lookup",
  ));
  const reviewerAccount = normalizeBotAccount(runGhJson(
    ["api", `users/${encodeURIComponent(reviewerLogin)}`],
    "Reviewer bot lookup",
  ));
  const repositoryMetadata = runGhJson(
    ["api", `repos/${repository}`],
    "Repository metadata lookup",
  );
  const defaultBranch = bound(repositoryMetadata?.default_branch, 300);
  if (!defaultBranch) {
    throw new Error("Repository metadata did not provide a default branch.");
  }
  const commit = runGhJson(
    ["api", `repos/${repository}/commits/${encodeURIComponent(defaultBranch)}`],
    "Default-branch commit lookup",
  );
  const headSha = bound(commit?.sha, 100);
  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error("Default-branch commit lookup did not provide a full SHA.");
  }

  const apiProbes = {
    actions_read: probeGh(["api", `repos/${repository}/actions/runs?per_page=1`]),
    checks_read: probeGh(["api", `repos/${repository}/commits/${headSha}/check-runs?per_page=1`]),
    statuses_read: probeGh(["api", `repos/${repository}/commits/${headSha}/statuses?per_page=1`]),
    pull_requests_read: probeGh(["api", `repos/${repository}/pulls?state=open&per_page=1`]),
    contents_read: probeGh([
      "api",
      `repos/${repository}/contents?ref=${encodeURIComponent(defaultBranch)}&per_page=1`,
    ]),
  };
  for (const probe of REQUIRED_API_PROBES) {
    if (!(probe in apiProbes)) {
      throw new Error(`Internal error: missing required API probe ${probe}.`);
    }
  }

  return {
    repository,
    installationId,
    appSlug,
    maintainerAccount,
    reviewerLogin,
    reviewerAccount,
    accessibleRepositories,
    repositoryPermissions: {
      pull: repositoryMetadata?.permissions?.pull === true,
      push: repositoryMetadata?.permissions?.push === true,
      admin: repositoryMetadata?.permissions?.admin === true,
      maintain: repositoryMetadata?.permissions?.maintain === true,
      triage: repositoryMetadata?.permissions?.triage === true,
    },
    apiProbes,
    governanceReport: readJson(governancePath, "Main governance audit"),
    defaultBranch,
    headSha,
  };
}

function buildReport(evidence, evaluation) {
  return {
    schema_version: 1,
    source: "github-app-effective-token-preflight",
    generated_at: new Date().toISOString(),
    repository: evidence.repository,
    installation_id: evidence.installationId,
    app_slug: evidence.appSlug,
    maintainer_bot_login: evidence.maintainerAccount.login,
    reviewer_login: evidence.reviewerLogin,
    maintenance_enabled: String(process.env.NOEMA_MAINTENANCE_ENABLED ?? "").trim() === "true",
    accessible_repositories: evidence.accessibleRepositories.map((item) => item.full_name),
    repository_permissions: evidence.repositoryPermissions,
    api_probes: evidence.apiProbes,
    governance_status: bound(evidence.governanceReport?.status, 100) || "missing",
    default_branch: evidence.defaultBranch,
    default_branch_head_sha: evidence.headSha,
    status: evaluation.status,
    checks: evaluation.checks,
    failures: evaluation.failures,
    limitations: [
      "The report proves the effective token minted for this run, not the complete underlying App installation registration.",
      "The pinned token action and explicit permission inputs are the effective permission boundary for this workflow run.",
      "App registration permissions, installation repository selection, key ownership, and break-glass actors remain reviewed administrator evidence under issue #29.",
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
    reviewer_login: bound(process.env.NOEMA_REVIEWER_LOGIN, 200),
    maintenance_enabled: String(process.env.NOEMA_MAINTENANCE_ENABLED ?? "").trim() === "true",
    accessible_repositories: [],
    repository_permissions: {},
    api_probes: Object.fromEntries(REQUIRED_API_PROBES.map((probe) => [probe, false])),
    governance_status: "unknown",
    default_branch: "",
    default_branch_head_sha: "",
    status: "FAIL",
    checks: [],
    failures: [
      {
        code: "collection_failed",
        detail: bound(error?.message || error),
      },
    ],
    limitations: [],
  };
}

export function main() {
  const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
  const reportPath = String(process.env.NOEMA_MAINTAINER_READINESS_PATH ?? defaultReportPath).trim()
    || defaultReportPath;
  const governancePath = String(process.env.NOEMA_GOVERNANCE_AUDIT_PATH ?? defaultGovernancePath).trim()
    || defaultGovernancePath;
  let report;
  try {
    if (!repositoryPattern.test(repository)) {
      throw new Error("GITHUB_REPOSITORY must identify a ContextualWisdomLab repository.");
    }
    const appSlug = String(process.env.NOEMA_MAINTAINER_APP_SLUG ?? "").trim();
    if (!appSlug) {
      throw new Error("NOEMA_MAINTAINER_APP_SLUG is required.");
    }
    const installationId = parsePositiveInteger(
      process.env.NOEMA_MAINTAINER_INSTALLATION_ID,
      "NOEMA_MAINTAINER_INSTALLATION_ID",
    );
    const reviewerLogin = String(process.env.NOEMA_REVIEWER_LOGIN ?? "").trim();
    if (!reviewerLogin) {
      throw new Error("NOEMA_REVIEWER_LOGIN is required.");
    }
    const evidence = collectEvidence({
      repository,
      appSlug,
      installationId,
      reviewerLogin,
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
  if (report.status !== "PASS") {
    process.exitCode = 1;
  }
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main();
}
