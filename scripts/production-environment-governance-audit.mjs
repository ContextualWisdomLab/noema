#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateProductionEnvironment } from "./lib/production-environment-governance.mjs";

const MAX_ERROR_CHARS = 4_000;
const MAX_GH_OUTPUT_BYTES = 2 * 1024 * 1024;
const repositoryPattern = /^ContextualWisdomLab\/[A-Za-z0-9_.-]+$/;
const defaultReportPath = "artifacts/governance/production-environment-governance.json";

function bound(value, limit = MAX_ERROR_CHARS) {
  const valueText = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return valueText.length <= limit ? valueText : `${valueText.slice(0, limit)}…`;
}

export function createGhSubprocessEnvironment(sourceEnvironment = process.env) {
  const childEnvironment = {
    GH_HOST: "github.com",
    NO_COLOR: "1",
  };
  if (typeof sourceEnvironment.PATH === "string" && sourceEnvironment.PATH.length > 0) {
    childEnvironment.PATH = sourceEnvironment.PATH;
  }
  if (typeof sourceEnvironment.GH_TOKEN === "string" && sourceEnvironment.GH_TOKEN.length > 0) {
    childEnvironment.GH_TOKEN = sourceEnvironment.GH_TOKEN;
  }
  return childEnvironment;
}

function runGh(args) {
  const completed = spawnSync("gh", args, {
    encoding: "utf8",
    env: createGhSubprocessEnvironment(),
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

function collectEnvironment(repository) {
  const raw = runGh([
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    "-H",
    "X-GitHub-Api-Version: 2026-03-10",
    `repos/${repository}/environments/production`,
  ]);
  if (!raw) {
    throw new Error("GitHub CLI returned an empty production environment response.");
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`GitHub CLI returned invalid JSON: ${bound(error?.message || error)}`);
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
    "## Production environment governance audit",
    "",
    `- Repository: \`${report.repository}\``,
    `- Environment: \`${report.environment}\``,
    `- Status: **${report.status}**`,
    `- Required reviewer identities: ${report.reviewer_count}`,
    `- Failures: ${report.failures.length}`,
  ];
  if (report.reviewers.length > 0) {
    lines.push("", "### Reviewers");
    for (const reviewer of report.reviewers) {
      lines.push(`- \`${reviewer.type}\` \`${reviewer.identifier}\` (id ${reviewer.id})`);
    }
  }
  if (report.failures.length > 0) {
    lines.push("", "### Failures");
    for (const failure of report.failures) {
      lines.push(`- \`${failure.code}\`: ${bound(failure.detail, 800)}`);
    }
  }
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function buildFailureReport(repository, error) {
  return {
    schema_version: 1,
    repository: repository || "unknown",
    environment: "production",
    generated_at: new Date().toISOString(),
    source: "github-deployment-environment-api",
    status: "FAIL",
    reviewer_count: 0,
    reviewers: [],
    checks: [],
    failures: [
      {
        code: "production_environment_collection_failed",
        detail: bound(error?.message || error),
      },
    ],
    limitations: [],
  };
}

export function main() {
  const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
  const reportPath = String(
    process.env.NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH ?? defaultReportPath,
  ).trim() || defaultReportPath;
  let report;
  try {
    if (!repositoryPattern.test(repository)) {
      throw new Error("GITHUB_REPOSITORY must identify a ContextualWisdomLab repository.");
    }
    const environment = collectEnvironment(repository);
    const evaluation = evaluateProductionEnvironment(environment);
    report = {
      schema_version: 1,
      repository,
      environment: "production",
      environment_id: Number.isSafeInteger(Number(environment?.id)) ? Number(environment.id) : null,
      environment_url: bound(environment?.html_url, 1_000) || null,
      generated_at: new Date().toISOString(),
      source: "github-deployment-environment-api",
      status: evaluation.status,
      reviewer_count: evaluation.reviewer_count,
      reviewers: evaluation.reviewers,
      checks: evaluation.checks,
      failures: evaluation.failures,
      limitations: [
        "The deployment environment API response does not prove that administrator bypass is disabled.",
        "Administrator bypass policy and reviewer ownership remain reviewed operational evidence.",
      ],
    };
  } catch (error) {
    report = buildFailureReport(repository, error);
  }

  const absoluteReportPath = writeReport(reportPath, report);
  appendOutput("production_environment_governance_status", report.status);
  appendOutput("production_environment_governance_report_path", absoluteReportPath);
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
