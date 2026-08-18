#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";
import {
  collectWorkflowRegistryAudit,
  createGhSubprocessEnvironment,
} from "./workflow-registry-audit.mjs";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const EXPECTED_DEFAULT_BRANCH = "main";
const REPOSITORY_WORKFLOW_PREFIX = ".github/workflows/";
const LOWERCASE_SHA_40 = /^[0-9a-f]{40}$/;
const MAX_GH_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_GH_REQUEST_MILLISECONDS = 20_000;
const MAX_PAGES = 1_000;
const PER_PAGE = 100;
const githubApiHeaders = [
  "-H",
  "Accept: application/vnd.github+json",
  "-H",
  "X-GitHub-Api-Version: 2022-11-28",
];

function decodeUtf8(value, channel) {
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

function boundedDiagnostic(value) {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\bbearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .trim();
  return cleaned.length <= 2_048 ? cleaned : `${cleaned.slice(0, 2_048)}…`;
}

/**
 * Parse one GitHub Actions workflow-list response into the bounded pagination
 * envelope consumed by the pure registry classifier.
 * @param {unknown} payload GitHub REST workflow-list response.
 * @param {number} page One-based page number requested from GitHub.
 * @param {number} perPage Requested page ceiling.
 * @returns {{totalCount: number, workflows: unknown[], hasNext: boolean}} Validated page.
 */
export function workflowPageFromResponse(payload, page, perPage) {
  if (
    !payload
    || !Number.isSafeInteger(payload.total_count)
    || payload.total_count < 0
    || !Array.isArray(payload.workflows)
    || !Number.isSafeInteger(page)
    || page < 1
    || !Number.isSafeInteger(perPage)
    || perPage < 1
  ) {
    throw new Error("GitHub workflow registry returned an invalid pagination envelope.");
  }
  if (payload.workflows.length > perPage) {
    throw new Error("GitHub workflow registry returned more records than the requested page ceiling.");
  }
  return {
    totalCount: payload.total_count,
    workflows: payload.workflows,
    hasNext: page * perPage < payload.total_count,
  };
}

function repositoryWorkflowEntryMap(payload) {
  if (!payload || payload.truncated === true) {
    throw new Error("Recursive Git tree is truncated; workflow absence is not provable.");
  }
  if (!Array.isArray(payload.tree)) {
    throw new Error("Recursive Git tree response is invalid.");
  }
  const entries = new Map();
  for (const entry of payload.tree) {
    if (
      entry?.type !== "blob"
      || typeof entry.path !== "string"
      || !entry.path.startsWith(REPOSITORY_WORKFLOW_PREFIX)
    ) {
      continue;
    }
    const identity = `${entry.type}\u0000${String(entry.mode ?? "")}\u0000${String(entry.sha ?? "")}`;
    const prior = entries.get(entry.path);
    if (prior !== undefined && prior !== identity) {
      throw new Error(`Recursive Git tree contains conflicting workflow entries for ${entry.path}.`);
    }
    entries.set(entry.path, identity);
  }
  return entries;
}

/**
 * Extract exact repository workflow blobs from one complete recursive Git tree.
 * A truncated tree cannot prove absence and therefore fails closed.
 * @param {unknown} payload GitHub recursive tree response.
 * @returns {string[]} Exact tracked workflow paths sorted for deterministic evidence.
 */
export function repositoryWorkflowPathsFromTree(payload) {
  return [...repositoryWorkflowEntryMap(payload).keys()].sort();
}

function changedWorkflowPathsBetweenTrees(basePayload, headPayload) {
  const baseEntries = repositoryWorkflowEntryMap(basePayload);
  const headEntries = repositoryWorkflowEntryMap(headPayload);
  const paths = new Set([...baseEntries.keys(), ...headEntries.keys()]);
  return [...paths]
    .filter((path) => baseEntries.get(path) !== headEntries.get(path))
    .sort();
}

function createGhJsonReader(delegatedGithubToken) {
  const childEnvironment = createGhSubprocessEnvironment({
    PATH: process.env.PATH,
    GH_TOKEN: delegatedGithubToken,
  });
  return async (endpoint) => {
    const completed = spawnSync("gh", ["api", ...githubApiHeaders, endpoint], {
      shell: false,
      env: childEnvironment,
      maxBuffer: MAX_GH_OUTPUT_BYTES,
      timeout: MAX_GH_REQUEST_MILLISECONDS,
    });
    if (completed.error) {
      throw new Error(`GitHub CLI could not complete: ${boundedDiagnostic(completed.error.message)}`);
    }
    if (completed.status !== 0) {
      const raw = completed.stderr?.length > 0 ? completed.stderr : completed.stdout;
      throw new Error(`GitHub CLI failed: ${boundedDiagnostic(decodeUtf8(raw, "failure diagnostics"))}`);
    }
    const text = decodeUtf8(completed.stdout, "stdout").trim();
    if (!text) throw new Error("GitHub CLI returned an empty JSON response.");
    if (hasDuplicateJsonObjectKeys(text)) {
      throw new Error("GitHub CLI returned JSON with duplicate decoded keys.");
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`GitHub CLI returned invalid JSON: ${boundedDiagnostic(error?.message ?? error)}`);
    }
  };
}

async function listArrayPages(ghJson, endpointForPage, label) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await ghJson(endpointForPage(page));
    if (!Array.isArray(payload)) {
      throw new Error(`${label} page ${page} is not an array.`);
    }
    if (payload.length > PER_PAGE) {
      throw new Error(`${label} page ${page} exceeds the requested page ceiling.`);
    }
    items.push(...payload);
    if (payload.length < PER_PAGE) return items;
  }
  throw new Error(`${label} pagination exceeded ${MAX_PAGES} pages without a terminal short page.`);
}

function openPullRequestSnapshot(pulls) {
  const identities = [];
  const seenNumbers = new Set();
  for (const pull of pulls) {
    if (!Number.isSafeInteger(pull?.number) || pull.number <= 0) {
      throw new Error("Open pull-request inventory contains an invalid pull number.");
    }
    if (!LOWERCASE_SHA_40.test(pull?.head?.sha ?? "")) {
      throw new Error("Open pull-request inventory contains an invalid head SHA.");
    }
    if (!LOWERCASE_SHA_40.test(pull?.base?.sha ?? "")) {
      throw new Error("Open pull-request inventory contains an invalid base SHA.");
    }
    if (seenNumbers.has(pull.number)) {
      throw new Error("Open pull-request inventory contains a duplicate pull number.");
    }
    seenNumbers.add(pull.number);
    identities.push(`${pull.number}:${pull.head.sha}:${pull.base.sha}`);
  }
  return identities.sort();
}

async function listOpenPullRequests(repository, ghJson) {
  return listArrayPages(
    ghJson,
    (page) => `repos/${repository}/pulls?state=open&per_page=${PER_PAGE}&page=${page}`,
    "Open pull requests",
  );
}

async function activePullRequestWorkflowPaths(repository, ghJson) {
  const pulls = await listOpenPullRequests(repository, ghJson);
  const initialSnapshot = openPullRequestSnapshot(pulls);
  const workflowPaths = new Set();
  for (const pull of pulls) {
    const files = await listArrayPages(
      ghJson,
      (page) => `repos/${repository}/pulls/${pull.number}/files?per_page=${PER_PAGE}&page=${page}`,
      `Pull request #${pull.number} files`,
    );
    const detail = await ghJson(`repos/${repository}/pulls/${pull.number}`);
    if (
      detail?.number !== pull.number
      || detail?.head?.sha !== pull.head.sha
      || detail?.base?.sha !== pull.base.sha
    ) {
      throw new Error(`Pull request #${pull.number} identity changed during file inventory.`);
    }
    if (!Number.isSafeInteger(detail?.changed_files) || detail.changed_files < 0) {
      throw new Error(`Pull request #${pull.number} advertised an invalid changed-file count.`);
    }
    if (files.length !== detail.changed_files) {
      throw new Error(
        `Pull request #${pull.number} file inventory retained ${files.length} of ${detail.changed_files} advertised changed files.`,
      );
    }

    const comparison = await ghJson(
      `repos/${repository}/compare/${pull.base.sha}...${pull.head.sha}`,
    );
    const mergeBaseSha = comparison?.merge_base_commit?.sha;
    if (!LOWERCASE_SHA_40.test(mergeBaseSha ?? "")) {
      throw new Error(`Pull request #${pull.number} comparison is missing a valid merge-base SHA.`);
    }
    const exactMergeBaseTree = await ghJson(
      `repos/${repository}/git/trees/${mergeBaseSha}?recursive=1`,
    );
    const exactHeadTree = await ghJson(
      `repos/${repository}/git/trees/${pull.head.sha}?recursive=1`,
    );
    for (const workflowPath of changedWorkflowPathsBetweenTrees(exactMergeBaseTree, exactHeadTree)) {
      workflowPaths.add(workflowPath);
    }
  }

  const finalSnapshot = openPullRequestSnapshot(
    await listOpenPullRequests(repository, ghJson),
  );
  if (JSON.stringify(finalSnapshot) !== JSON.stringify(initialSnapshot)) {
    throw new Error("Open pull-request inventory changed during workflow-path collection.");
  }

  return [...workflowPaths].sort();
}

/**
 * Collect the live Actions registry against independently re-resolved protected
 * main and one stable open-PR head/base snapshot. Active-PR workflow ownership
 * is derived from each immutable merge-base→head tree delta. This function is
 * read-only; it produces orphan findings but never disables workflow identities.
 * @param {object} input Collector dependencies.
 * @returns {Promise<object>} Exact-main-bound workflow-registry audit evidence.
 */
export async function collectLiveWorkflowRegistryAudit(input) {
  const repository = input?.repository ?? EXPECTED_REPOSITORY;
  const defaultBranch = input?.defaultBranch ?? EXPECTED_DEFAULT_BRANCH;
  const ghJson = input?.ghJson;
  const now = input?.now ?? (() => new Date().toISOString());

  if (typeof ghJson !== "function") {
    throw new TypeError("Live workflow registry collection requires a GitHub JSON reader.");
  }

  const resolveDefaultBranch = async () => {
    if (repository !== EXPECTED_REPOSITORY || defaultBranch !== EXPECTED_DEFAULT_BRANCH) {
      throw new Error(`Live workflow audit is restricted to ${EXPECTED_REPOSITORY}@${EXPECTED_DEFAULT_BRANCH}.`);
    }
    const branch = await ghJson(`repos/${repository}/branches/${defaultBranch}`);
    const sha = branch?.commit?.sha;
    if (typeof sha !== "string") {
      throw new Error("Protected-main branch response is missing an exact commit SHA.");
    }
    const tree = await ghJson(`repos/${repository}/git/trees/${sha}?recursive=1`);
    return {
      sha,
      workflowPaths: repositoryWorkflowPathsFromTree(tree),
    };
  };

  return collectWorkflowRegistryAudit({
    repository,
    resolveDefaultBranch,
    listWorkflowPage: async ({ page, perPage }) => workflowPageFromResponse(
      await ghJson(`repos/${repository}/actions/workflows?per_page=${perPage}&page=${page}`),
      page,
      perPage,
    ),
    listActivePullRequestWorkflowPaths: () => activePullRequestWorkflowPaths(repository, ghJson),
    now,
  });
}

/**
 * Run the operator-facing read-only audit using a short-lived delegated GitHub
 * capability loaded from the same explicit token file used by other governance
 * scripts. No ambient GitHub or model secret is inherited by the child CLI.
 * @returns {Promise<object>} Machine-readable audit result also printed to stdout.
 */
export async function main() {
  const repository = String(process.env.GITHUB_REPOSITORY ?? EXPECTED_REPOSITORY).trim();
  const tokenPath = String(process.env.NOEMA_MAINTAINER_TOKEN_PATH ?? "").trim();
  let report;
  try {
    const delegatedGithubToken = readDelegatedGithubToken(tokenPath);
    report = await collectLiveWorkflowRegistryAudit({
      repository,
      defaultBranch: EXPECTED_DEFAULT_BRANCH,
      ghJson: createGhJsonReader(delegatedGithubToken),
    });
  } catch (error) {
    report = {
      schema_version: 1,
      repository_full_name: repository || null,
      default_branch_sha: null,
      observed_at: new Date().toISOString(),
      pagination_receipts: [],
      status: "FAIL",
      failures: [{
        code: "workflow_registry_live_audit_failed",
        detail: boundedDiagnostic(error?.message ?? error),
      }],
      workflows: [],
    };
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await main();
}
