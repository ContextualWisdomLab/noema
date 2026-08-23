#!/usr/bin/env node

import {
  closeSync,
  lstatSync,
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
  MAX_RUNNER_QUEUE_GRACE_MILLISECONDS,
  evaluateRunnerAssignmentEvidence,
} from "./lib/actions-runner-assignment-audit.mjs";
import {
  collectRunnerAssignmentEvidence,
  parseSelectedRunIds,
} from "./lib/actions-runner-assignment-source.mjs";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import { assertAcquisitionPrivatePathParents } from "./lib/acquisition-private-output.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const AUDITED_REPOSITORY = "ContextualWisdomLab/noema";
const GITHUB_API_VERSION = "2026-03-10";
const GH_API_TIMEOUT_MILLISECONDS = 20_000;
const GH_API_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const REPORT_PATH = "artifacts/operations/actions-runner-assignment-audit.json";
const canonicalShaPattern = /^[0-9a-f]{40}$/;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const auditCredentialPresenceMarker = "delegated-capability-present";

const defaultGhRuntime = {
  spawn_sync: spawnSync,
  environment: process.env,
};

const defaultWriteIo = {
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
  closeSync,
  renameSync,
  unlinkSync,
  randomUUID,
};

function boundedErrorText(value) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1000);
}

/**
 * Replace every exact occurrence of an active secret with a fixed marker.
 *
 * An empty or non-string secret is left untouched. `String.prototype.split("")`
 * would otherwise insert the marker between every character and leak a
 * transformed diagnostic that is no longer the original failure text.
 *
 * @param {unknown} value Untrusted diagnostic text.
 * @param {unknown} secret Active credential that must not be retained.
 * @returns {string} Diagnostic text with exact secret occurrences removed.
 */
export function redactExactSecret(value, secret) {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (typeof secret !== "string" || secret.length === 0) {
    return text;
  }
  return text.split(secret).join("[REDACTED]");
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
 * Decode and parse bounded GitHub API bytes without normalizing ambiguous input.
 *
 * Malformed UTF-8 and duplicate decoded object keys fail before `JSON.parse`, so
 * runner-assignment evidence cannot inherit replacement-character or
 * last-key-wins semantics from the JavaScript runtime.
 *
 * @param {Uint8Array} bytes Raw stdout bytes returned by the GitHub CLI.
 * @returns {unknown} Parsed JSON evidence.
 */
export function parseGhJsonEvidence(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("GitHub Actions evidence must be supplied as raw bytes.");
  }

  let text;
  try {
    text = fatalUtf8Decoder.decode(bytes);
  } catch {
    throw new Error("GitHub Actions evidence read returned invalid UTF-8.");
  }

  let duplicateKeys;
  try {
    duplicateKeys = hasDuplicateJsonObjectKeys(text);
  } catch {
    throw new Error("GitHub Actions evidence read returned malformed JSON.");
  }
  if (duplicateKeys) {
    throw new Error("GitHub Actions evidence read returned duplicate decoded object keys.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("GitHub Actions evidence read returned malformed JSON.");
  }
}

/**
 * Read one GitHub REST resource through the authenticated `gh` CLI.
 *
 * The caller supplies only repository-relative API paths. Pagination uses
 * `--slurp` so every returned page remains explicit to the bounded source
 * collector instead of being silently collapsed or truncated. The optional
 * runtime is an explicit test seam only; production callers use the pinned
 * shell-free `spawnSync` runtime and least-authority environment.
 *
 * @param {string} path Repository-relative GitHub REST path.
 * @param {{paginate?: boolean}} options Read options.
 * @param {{spawn_sync?: Function, environment?: object}} runtime Process runtime.
 * @returns {unknown} Parsed GitHub JSON evidence.
 */
export function ghApi(path, options = {}, runtime = defaultGhRuntime) {
  if (typeof path !== "string" || path.length === 0 || path.length > 1000) {
    throw new Error("GitHub API path is invalid.");
  }
  if (path.startsWith("/") || path.includes("..") || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("GitHub API path is outside the bounded relative-path contract.");
  }
  if (!runtime || typeof runtime.spawn_sync !== "function") {
    throw new Error("A shell-free GitHub CLI spawn runtime is required.");
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

  const subprocessEnvironment = createGhSubprocessEnvironment(runtime.environment ?? process.env);
  const result = runtime.spawn_sync("gh", args, {
    timeout: GH_API_TIMEOUT_MILLISECONDS,
    maxBuffer: GH_API_MAX_BUFFER_BYTES,
    env: subprocessEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(
      `GitHub Actions evidence read failed: ${boundedErrorText(redactExactSecret(result.error.message, subprocessEnvironment.GH_TOKEN))}`,
    );
  }
  if (result.status !== 0) {
    const diagnostic = boundedErrorText(
      redactExactSecret(result.stderr, subprocessEnvironment.GH_TOKEN),
    );
    throw new Error(
      `GitHub Actions evidence read failed with gh exit ${result.status}:${diagnostic ? ` ${diagnostic}` : ""}`,
    );
  }

  return parseGhJsonEvidence(result.stdout);
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
  if (parsed > MAX_RUNNER_QUEUE_GRACE_MILLISECONDS) {
    throw new Error(
      `NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS must be at most ${MAX_RUNNER_QUEUE_GRACE_MILLISECONDS}.`,
    );
  }
  return parsed;
}

/**
 * Write the fixed audit report atomically with owner-only temporary permissions.
 *
 * The optional I/O seam permits deterministic failure testing without changing
 * the production report path, file mode, atomic rename, or cleanup semantics.
 *
 * @param {unknown} report Bounded report value.
 * @param {object} io File-system and UUID operations.
 * @returns {string} Absolute report path.
 */
export function writeReportAtomically(report, io = defaultWriteIo) {
  const reportPath = resolve(REPORT_PATH);
  const reportDirectory = dirname(reportPath);
  assertAcquisitionPrivatePathParents(reportPath, io);
  io.mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
  assertAcquisitionPrivatePathParents(reportPath, io);
  const temporaryPath = `${reportPath}.tmp-${process.pid}-${io.randomUUID()}`;
  let descriptor;
  try {
    descriptor = io.openSync(temporaryPath, "wx", 0o600);
    io.writeFileSync(descriptor, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    io.closeSync(descriptor);
    descriptor = undefined;
    io.renameSync(temporaryPath, reportPath);
  } finally {
    if (descriptor !== undefined) {
      try {
        io.closeSync(descriptor);
      } catch {
        // Cleanup failures must not replace the original report-write failure.
      }
    }
    try {
      io.unlinkSync(temporaryPath);
    } catch {
      // Cleanup failures must not replace the original report-write result.
    }
  }
  return reportPath;
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
  const observedAtMilliseconds = typeof input.observed_at === "string"
    ? Date.parse(input.observed_at)
    : Number.NaN;
  if (
    !Number.isFinite(observedAtMilliseconds)
    || new Date(observedAtMilliseconds).toISOString() !== input.observed_at
  ) {
    throw new Error("observed_at must be a canonical UTC timestamp.");
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

/**
 * Execute the CLI with injectable boundaries while preserving production defaults.
 *
 * Production reads the delegated bearer credential only from the repository's
 * descriptor-safe capability-file boundary. Tests may inject a pre-authenticated
 * reader and explicit environment without requiring filesystem credential access.
 *
 * @param {object} options Runtime overrides used only by tests/operators.
 * @returns {Promise<{exit_code: number, report: object}>} Audit result.
 */
export async function main(options = {}) {
  const sourceEnvironment = options.env ?? process.env;
  let auditEnvironment = sourceEnvironment;
  let githubApi = options.gh_api;

  if (githubApi === undefined) {
    const tokenPath = String(sourceEnvironment.NOEMA_MAINTAINER_TOKEN_PATH ?? "").trim();
    const delegatedToken = readDelegatedGithubToken(tokenPath);
    const subprocessEnvironment = {
      PATH: sourceEnvironment.PATH,
      GH_TOKEN: delegatedToken,
    };
    auditEnvironment = {
      GH_TOKEN: auditCredentialPresenceMarker,
      NOEMA_ACTIONS_AUDIT_REPOSITORY: sourceEnvironment.NOEMA_ACTIONS_AUDIT_REPOSITORY,
      NOEMA_ACTIONS_AUDIT_HEAD_SHA: sourceEnvironment.NOEMA_ACTIONS_AUDIT_HEAD_SHA,
      NOEMA_ACTIONS_AUDIT_RUN_IDS: sourceEnvironment.NOEMA_ACTIONS_AUDIT_RUN_IDS,
      NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS:
        sourceEnvironment.NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS,
    };
    githubApi = (path, apiOptions) => ghApi(path, apiOptions, {
      spawn_sync: spawnSync,
      environment: subprocessEnvironment,
    });
  }

  const result = await runActionsRunnerAssignmentAudit({
    env: auditEnvironment,
    observed_at: options.observed_at ?? new Date().toISOString(),
    gh_api: githubApi,
    write_report: options.write_report ?? writeReportAtomically,
  });
  const writeOutput = options.write_output ?? ((value) => process.stdout.write(value));
  const setExitCode = options.set_exit_code ?? ((code) => {
    process.exitCode = code;
  });
  writeOutput(`${result.report.status}\n`);
  setExitCode(result.exit_code);
  return result;
}

/**
 * Run a CLI promise with bounded error output and a distinct internal-error exit.
 *
 * @param {object} options Execution/output overrides.
 * @returns {Promise<unknown>} Execution result, or undefined after a bounded error.
 */
export async function startCli(options = {}) {
  const execute = options.execute ?? main;
  const writeError = options.write_error ?? ((value) => process.stderr.write(value));
  const setExitCode = options.set_exit_code ?? ((code) => {
    process.exitCode = code;
  });
  try {
    return await execute();
  } catch (error) {
    writeError(`runner-assignment audit failed: ${boundedErrorText(error?.message)}\n`);
    setExitCode(2);
    return undefined;
  }
}

/** Execute a supplied CLI only when the module is the process entry point. */
export function runIfDirect(metaUrl, argv, execute) {
  if (!argv[1] || metaUrl !== pathToFileURL(resolve(argv[1])).href) return false;
  void execute();
  return true;
}

runIfDirect(import.meta.url, process.argv, startCli);
