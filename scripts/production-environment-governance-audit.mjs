#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateProductionEnvironment } from "./lib/production-environment-governance.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

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

/**
 * Redact exact sensitive values from a diagnostic before it is retained.
 *
 * @param {unknown} value Diagnostic value to render.
 * @param {unknown[]} [sensitiveValues=[]] Exact secret values that must not escape.
 * @returns {string} Redacted diagnostic text.
 */
export function redactSensitiveValue(value, sensitiveValues = []) {
  let redacted = String(value ?? "");
  for (const sensitiveValue of sensitiveValues) {
    if (typeof sensitiveValue !== "string" || sensitiveValue.length === 0) {
      continue;
    }
    redacted = redacted.split(sensitiveValue).join("[REDACTED]");
  }
  return redacted;
}

/**
 * Build the least-authority environment passed to the read-only GitHub CLI.
 *
 * @param {NodeJS.ProcessEnv} [sourceEnvironment=process.env] Ambient process environment.
 * @returns {Record<string, string>} Allow-listed child-process environment.
 */
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

/**
 * Decode GitHub CLI output without allowing replacement characters to convert
 * malformed remote evidence into a different, parseable JSON document.
 *
 * @param {Uint8Array} value Raw subprocess bytes.
 * @param {string} [label="output"] Diagnostic stream label.
 * @returns {string} Exact UTF-8 text.
 */
export function decodeGhOutput(value, label = "output") {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error(`GitHub CLI returned invalid UTF-8 in ${label}.`);
  }
}

/**
 * Execute one bounded GitHub CLI request for production-governance evidence.
 * Runtime callers use the real shell-free spawn implementation and current
 * process environment. Tests may inject only these two boundaries so failure
 * byte selection, UTF-8 handling, and secret redaction are exercised directly.
 *
 * @param {string[]} args GitHub CLI arguments.
 * @param {{sourceEnvironment?: NodeJS.ProcessEnv, spawnSyncImpl?: typeof spawnSync}} [options]
 *   Explicit environment source and subprocess primitive.
 * @returns {string} Trimmed, fatal-decoded stdout on success.
 */
export function runGh(
  args,
  {
    sourceEnvironment = process.env,
    spawnSyncImpl = spawnSync,
  } = {},
) {
  const childEnvironment = createGhSubprocessEnvironment(sourceEnvironment);
  const completed = spawnSyncImpl("gh", args, {
    env: childEnvironment,
    maxBuffer: MAX_GH_OUTPUT_BYTES,
    shell: false,
  });
  if (completed.error) {
    const detail = redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI could not start: ${bound(detail)}`);
  }
  if (completed.status !== 0) {
    let rawDetail;
    if (completed.stderr?.length) {
      rawDetail = decodeGhOutput(completed.stderr, "stderr");
    } else if (completed.stdout?.length) {
      rawDetail = decodeGhOutput(completed.stdout, "stdout");
    } else {
      rawDetail = `exit ${completed.status}`;
    }
    const detail = redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI failed: ${bound(detail)}`);
  }
  return decodeGhOutput(completed.stdout, "stdout").trim();
}

function collectEnvironment(repository, runGhImpl) {
  const raw = runGhImpl([
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
  let hasDuplicateKeys;
  try {
    hasDuplicateKeys = hasDuplicateJsonObjectKeys(raw);
  } catch (error) {
    throw new Error(`GitHub CLI returned invalid JSON: ${bound(error?.message || error)}`);
  }
  if (hasDuplicateKeys) {
    throw new Error("GitHub CLI returned JSON with duplicate decoded object keys.");
  }
  return JSON.parse(raw);
}

function writeReport(path, report) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return absolutePath;
}

function appendOutput(name, value, sourceEnvironment) {
  const outputPath = sourceEnvironment.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${String(value).replace(/[\r\n]/g, "")}\n`, "utf8");
  }
}

function appendSummary(report, sourceEnvironment) {
  const summaryPath = sourceEnvironment.GITHUB_STEP_SUMMARY;
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

/**
 * Collect and evaluate the live production-environment governance evidence.
 * Dependency injection is deliberately limited to the read-only GitHub CLI,
 * process environment, logging sink, and exit-code sink so realistic tests can
 * exercise every evidence boundary without granting network or write authority.
 *
 * @param {{
 *   sourceEnvironment?: NodeJS.ProcessEnv,
 *   runGhImpl?: typeof runGh,
 *   log?: (value: string) => void,
 *   setExitCode?: (value: number) => void,
 * }} [options] Bounded runtime dependencies.
 * @returns {Record<string, unknown>} Evaluated report written to the evidence path.
 */
export function main(
  {
    sourceEnvironment = process.env,
    runGhImpl = runGh,
    log = console.log,
    setExitCode = (value) => {
      process.exitCode = value;
    },
  } = {},
) {
  const repository = String(sourceEnvironment.GITHUB_REPOSITORY ?? "").trim();
  const reportPath = String(
    sourceEnvironment.NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH ?? defaultReportPath,
  ).trim() || defaultReportPath;
  let report;
  try {
    if (!repositoryPattern.test(repository)) {
      throw new Error("GITHUB_REPOSITORY must identify a ContextualWisdomLab repository.");
    }
    const environment = collectEnvironment(repository, runGhImpl);
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
  appendOutput("production_environment_governance_status", report.status, sourceEnvironment);
  appendOutput("production_environment_governance_report_path", absoluteReportPath, sourceEnvironment);
  appendSummary(report, sourceEnvironment);
  log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") {
    setExitCode(1);
  }
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main();
}
