#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import { evaluateMainGovernanceRules } from "./lib/main-governance-audit.mjs";

const MAX_ERROR_CHARS = 4_000;
const MAX_GH_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_GH_REQUEST_MILLISECONDS = 20_000;
const repositoryPattern = /^ContextualWisdomLab\/[A-Za-z0-9_.-]+$/;
const defaultReportPath = "artifacts/governance/main-governance-audit.json";
const githubApiHeaders = [
  "-H",
  "Accept: application/vnd.github+json",
  "-H",
  "X-GitHub-Api-Version: 2022-11-28",
];

function bound(value, limit = MAX_ERROR_CHARS) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

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

export function createGhSubprocessEnvironment(sourceEnvironment = {}) {
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

function hasOutputBytes(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return value.byteLength > 0;
  }
  return String(value ?? "").length > 0;
}

function decodeGhOutput(value, channel) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(String(value ?? ""), "utf8");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`GitHub CLI returned invalid UTF-8 in ${channel}.`);
  }
}

function runGh(args, delegatedGithubToken) {
  const childEnvironment = createGhSubprocessEnvironment({
    PATH: process.env.PATH,
    GH_TOKEN: delegatedGithubToken,
  });
  const completed = spawnSync("gh", ["api", ...githubApiHeaders, ...args], {
    maxBuffer: MAX_GH_OUTPUT_BYTES,
    timeout: MAX_GH_REQUEST_MILLISECONDS,
    shell: false,
    env: childEnvironment,
  });
  if (completed.error) {
    const detail = redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI could not complete: ${bound(detail)}`);
  }
  if (completed.status !== 0) {
    const selectedOutput = hasOutputBytes(completed.stderr)
      ? completed.stderr
      : hasOutputBytes(completed.stdout)
        ? completed.stdout
        : `exit ${completed.status}`;
    const rawDetail = typeof selectedOutput === "string"
      ? selectedOutput
      : decodeGhOutput(selectedOutput, "failure diagnostics");
    const detail = redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI failed: ${bound(detail)}`);
  }
  return decodeGhOutput(completed.stdout, "stdout").trim();
}

function runGhJson(args, delegatedGithubToken) {
  const raw = runGh(args, delegatedGithubToken);
  if (!raw) {
    throw new Error("GitHub CLI returned an empty active-rules response.");
  }
  let hasDuplicateKeys;
  try {
    hasDuplicateKeys = hasDuplicateJsonObjectKeys(raw);
  } catch (error) {
    throw new Error(`GitHub CLI returned invalid JSON: ${bound(error.message)}`);
  }
  if (hasDuplicateKeys) {
    throw new Error("GitHub CLI returned duplicate decoded JSON keys.");
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`GitHub CLI returned invalid JSON: ${bound(error.message)}`);
  }
}

export function flattenRulePages(pages) {
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated active-rules response must be an array of pages.");
  }
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) {
      throw new TypeError("Each active-rules page must be an array.");
    }
    return page;
  });
}

function collectRuleSources(rules) {
  const sources = new Map();
  for (const rule of rules) {
    const id = Number(rule?.ruleset_id);
    const sourceType = bound(rule?.ruleset_source_type, 100);
    const source = bound(rule?.ruleset_source, 300);
    const key = `${Number.isSafeInteger(id) ? id : "unknown"}\u0000${sourceType}\u0000${source}`;
    if (!sources.has(key)) {
      sources.set(key, {
        ruleset_id: Number.isSafeInteger(id) ? id : null,
        source_type: sourceType || "unknown",
        source: source || "unknown",
      });
    }
  }
  return [...sources.values()].sort((left, right) => {
    const idDelta = Number(left.ruleset_id || 0) - Number(right.ruleset_id || 0);
    return idDelta !== 0 ? idDelta : left.source.localeCompare(right.source);
  });
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
    "## Main governance audit",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.branch}\``,
    `- Status: **${report.status}**`,
    `- Active rules: ${report.active_rule_count}`,
    `- Ruleset sources: ${report.rule_sources.length}`,
    `- Failures: ${report.failures.length}`,
  ];
  if (report.failures.length > 0) {
    lines.push("", "### Failures");
    for (const failure of report.failures) {
      lines.push(`- \`${failure.code}\`: ${bound(failure.detail, 800)}`);
    }
  }
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function buildReport(repository, rules, evaluation) {
  return {
    schema_version: 1,
    repository,
    branch: "main",
    generated_at: new Date().toISOString(),
    source: "github-active-branch-rules",
    status: evaluation.status,
    active_rule_count: rules.length,
    active_rule_types: [...new Set(rules.map((rule) => bound(rule?.type, 100) || "unknown"))].sort(),
    rule_sources: collectRuleSources(rules),
    checks: evaluation.checks,
    failures: evaluation.failures,
    limitations: [
      "The active-rules endpoint proves effective branch rules but does not prove that bypass actors are appropriately restricted.",
      "Break-glass actors and key ownership remain reviewed operational evidence under issue #27.",
    ],
  };
}

export function main() {
  const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
  const reportPath = String(process.env.NOEMA_GOVERNANCE_AUDIT_PATH ?? defaultReportPath).trim()
    || defaultReportPath;
  const tokenPath = String(process.env.NOEMA_MAINTAINER_TOKEN_PATH ?? "").trim();
  let report;
  try {
    if (!repositoryPattern.test(repository)) {
      throw new Error("GITHUB_REPOSITORY must identify a ContextualWisdomLab repository.");
    }
    const delegatedGithubToken = readDelegatedGithubToken(tokenPath);
    const endpoint = `repos/${repository}/rules/branches/main?per_page=100`;
    const pages = runGhJson(["--paginate", "--slurp", endpoint], delegatedGithubToken);
    const rules = flattenRulePages(pages);
    report = buildReport(repository, rules, evaluateMainGovernanceRules(rules));
  } catch (error) {
    report = {
      schema_version: 1,
      repository: repository || "unknown",
      branch: "main",
      generated_at: new Date().toISOString(),
      source: "github-active-branch-rules",
      status: "FAIL",
      active_rule_count: 0,
      active_rule_types: [],
      rule_sources: [],
      checks: [],
      failures: [
        {
          code: "governance_collection_failed",
          detail: bound(error?.message || error),
        },
      ],
      limitations: [],
    };
  }

  const absoluteReportPath = writeReport(reportPath, report);
  appendOutput("governance_status", report.status);
  appendOutput("governance_report_path", absoluteReportPath);
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
