#!/usr/bin/env node

import {
  closeSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS,
  evaluateRunnerAssignmentEvidence,
} from "./lib/actions-runner-assignment-audit.mjs";
import {
  collectRunnerAssignmentEvidence,
  parseSelectedRunIds,
} from "./lib/actions-runner-assignment-source.mjs";

const AUDITED_REPOSITORY = "ContextualWisdomLab/noema";
const GITHUB_API_VERSION = "2026-03-10";
const GH_API_TIMEOUT_MILLISECONDS = 20_000;
const GH_API_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const REPORT_PATH = "artifacts/operations/actions-runner-assignment-audit.json";
const canonicalShaPattern = /^[0-9a-f]{40}$/;

function boundedErrorText(value) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1000);
}

/**
 * Build the least-privilege environment inherited by the `gh` subprocess.
 *
 * Only executable lookup and the read-only GitHub CLI authentication contract
 * cross the process boundary. Repository-write tokens, model credentials,
 * Maintainer/Reviewer App secrets, proxy settings, HOME-scoped credentials,
 * and other ambient process state are deliberately excluded.
 *
 * @param {unknown} environment Untrusted parent-process environment mapping.
 * @returns {{PATH: string, GH_TOKEN: string, GH_HOST: string, NO_COLOR: string}}
 *   Minimal GitHub CLI environment pinned to GitHub Cloud.
 */
export function createGhSubprocessEnvironment(environment) {
  if (!environment || typeof environment !== "object") {
    throw new Error("GitHub CLI subprocess environment must be an object.");
  }
  const executablePath = environment.PATH;
  if (typeof executablePath !== "string" || executablePath.trim().length === 0) {
    throw new Error("PATH is required for the GitHub CLI subprocess.");
  }
  const token = environment.GH_TOKEN;
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("GH_TOKEN is required for the GitHub CLI subprocess.");
  }
  return {
    PATH: executablePath,
    GH_TOKEN: token,
    GH_HOST: "github.com",
    NO_COLOR: "1",
  };
}

/**
 * Read one GitHub REST resource through the authenticated `gh` CLI.
 *
 * The caller supplies only repository-relative API paths. Pagination uses
 * `--slurp` so every returned page remains explicit to the bounded source
 * collector instead of being silently collapsed or truncated.
 */
export function ghApi(path, options = {}) {
  if (typeof path !== "string" || path.length === 0 || path.length > 1000) {
    throw new Error("GitHub API path is invalid.");
  }
  if (path.startsWith("/") || path.includes("..") || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("GitHub API path is outside the bounded relative-path contract.");
  }

  const args = [
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    "-H",
    `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
  ];
  if (options.paginate === true) {
    args.push("--paginate", "--slurp");
  }
  args.push(path);

  const result = spawnSync("gh", args, {
    encoding: "utf8",
    timeout: GH_API_TIMEOUT_MILLISECONDS,
    maxBuffer: GH_API_MAX_BUFFER_BYTES,
    env: createGhSubprocessEnvironment(process.env),
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`GitHub Actions evidence read failed: ${boundedErrorText(result.error.message)}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `GitHub Actions evidence read failed with gh exit ${result.status}: ${boundedErrorText(result.stderr)}`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub Actions evidence read returned malformed JSON.");
  }
}

/**
 * Create read-only GitHub Actions REST adapters for the operator audit.
 *
 * @param {{repository: string, gh_api: Function}} input Repository and API reader.
 * @returns {{fetch_run: Function, fetch_job_pages: Function}} Bounded read adapters.
 */
export function createGhReadAdapters(input) {
  if (!input || input.repository !== AUDITED_REPOSITORY) {
    throw new Error(`Runner-assignment audit is restricted to ${AUDITED_REPOSITORY}.`);
  }
  if (typeof input.gh_api !== "function") {
    throw new Error("A read-only GitHub API adapter is required.");
  }

  return {
    fetch_run: async (runId) =>
      input.gh_api(`repos/${AUDITED_REPOSITORY}/actions/runs/${runId}`, {
        paginate: false,
      }),
    fetch_job_pages: async (runId) =>
      input.gh_api(
        `repos/${AUDITED_REPOSITORY}/actions/runs/${runId}/jobs?filter=all&per_page=100`,
        { paginate: true },
      ),
  };
}

function parseQueueGrace(value) {
  if (value === undefined || value === "") {
    return DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error("NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS must be a positive integer.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS must be a safe integer.");
  }
  return parsed;
}

/** Write the fixed audit report atomically with owner-only temporary permissions. */
export function writeReportAtomically(report) {
  const reportPath = resolve(REPORT_PATH);
  const reportDirectory = dirname(reportPath);
  mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${reportPath}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, reportPath);
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
    try {
      unlinkSync(temporaryPath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

/**
 * Execute the runner-assignment audit from explicit operator inputs.
 *
 * `PENDING` is deliberately a nonzero result. A runner being assigned is also
 * not a substitute for the later workflow/check conclusion, review, merge,
 * release, or deployment authority.
 */
export async function runActionsRunnerAssignmentAudit(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Runner-assignment audit input must be an object.");
  }
  const env = input.env;
  if (!env || typeof env !== "object") {
    throw new Error("Runner-assignment audit environment is required.");
  }
  if (typeof env.GH_TOKEN !== "string" || env.GH_TOKEN.trim().length === 0) {
    throw new Error("GH_TOKEN is required for read-only GitHub Actions evidence collection.");
  }

  const repository = env.NOEMA_ACTIONS_AUDIT_REPOSITORY;
  if (repository !== AUDITED_REPOSITORY) {
    throw new Error(`NOEMA_ACTIONS_AUDIT_REPOSITORY must equal ${AUDITED_REPOSITORY}.`);
  }

  const expectedHeadSha = env.NOEMA_ACTIONS_AUDIT_HEAD_SHA;
  if (typeof expectedHeadSha !== "string" || !canonicalShaPattern.test(expectedHeadSha)) {
    throw new Error("NOEMA_ACTIONS_AUDIT_HEAD_SHA must be a canonical lowercase 40-character SHA.");
  }
  const runIds = parseSelectedRunIds(env.NOEMA_ACTIONS_AUDIT_RUN_IDS);
  const queueGrace = parseQueueGrace(env.NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS);
  if (typeof input.observed_at !== "string" || !Number.isFinite(Date.parse(input.observed_at))) {
    throw new Error("observed_at must be a parseable timestamp.");
  }
  if (typeof input.write_report !== "function") {
    throw new Error("A report writer is required.");
  }

  const adapters = createGhReadAdapters({
    repository,
    gh_api: input.gh_api,
  });
  const evidence = await collectRunnerAssignmentEvidence({
    expected_head_sha: expectedHeadSha,
    observed_at: input.observed_at,
    queue_grace_milliseconds: queueGrace,
    run_ids: runIds,
    fetch_run: adapters.fetch_run,
    fetch_job_pages: adapters.fetch_job_pages,
  });
  const decision = evaluateRunnerAssignmentEvidence(evidence);
  const report = {
    schema_version: 1,
    objective: "github_actions_runner_assignment",
    repository,
    expected_head_sha: expectedHeadSha,
    selected_run_ids: runIds,
    observed_at: input.observed_at,
    queue_grace_milliseconds: queueGrace,
    status: decision.status,
    checks: decision.checks,
    failures: decision.failures,
    authority: {
      runner_assignment_only: true,
      required_check_success: false,
      review_authority: false,
      merge_authority: false,
      release_authority: false,
      deployment_authority: false,
    },
  };
  await input.write_report(report);

  return {
    exit_code: decision.status === "PASS" ? 0 : 1,
    report,
  };
}

async function main() {
  const result = await runActionsRunnerAssignmentAudit({
    env: process.env,
    observed_at: new Date().toISOString(),
    gh_api: ghApi,
    write_report: writeReportAtomically,
  });
  process.stdout.write(`${result.report.status}\n`);
  process.exitCode = result.exit_code;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`runner-assignment audit failed: ${boundedErrorText(error?.message)}\n`);
    process.exitCode = 2;
  });
}
