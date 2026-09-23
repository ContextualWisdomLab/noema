#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluatePullRequest } from "./lib/commercial-readiness-loop.mjs";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import {
  REQUIRED_MAIN_CHECK_INTEGRATION_ID,
  REQUIRED_MAIN_WORKFLOW,
} from "./lib/main-governance-audit.mjs";

const MAX_ERROR_CHARS = 4_000;
const MAX_REPORT_DETAIL_CHARS = 1_000;
const MAX_GH_OUTPUT_BYTES = 16 * 1024 * 1024;
const repositoryPattern = /^ContextualWisdomLab\/[A-Za-z0-9_.-]+$/;
const botLoginPattern = /^[A-Za-z0-9-]+\[bot\]$/;
const fullShaPattern = /^[0-9a-f]{40}$/i;
const noemaMarkerPattern = /<!--\s*noema-review-gate\s+head_sha=([0-9a-f]{40})\s+decision=(approve|request_changes|blocked)\s*-->/g;
const noemaMarkerEnvelopePattern = /<!--\s*noema-review-gate\b[\s\S]*?-->/gi;
const noemaCredentialMarker = "Reviewer credential: `noema-github-app`";
const reviewThreadQuery = "query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$endCursor){nodes{isResolved}pageInfo{hasNextPage endCursor}}}}}";
const activeWorkflowRunStatuses = new Set([
  "requested",
  "waiting",
  "pending",
  "queued",
  "in_progress",
]);
const requiredCheckWorkflowAuthority = Object.freeze({
  verify: Object.freeze({
    path: ".github/workflows/ci.yml",
    source: "repository_workflow",
    protectedFromPullRequestMutation: true,
  }),
  reviewer: Object.freeze({
    path: ".github/workflows/reviewer-ci.yml",
    source: "repository_workflow",
    protectedFromPullRequestMutation: true,
  }),
  scorecard: Object.freeze({
    path: ".github/workflows/security-scan.yml",
    source: "required_workflow",
    protectedFromPullRequestMutation: false,
  }),
  "osv-scan": Object.freeze({
    path: ".github/workflows/security-scan.yml",
    source: "required_workflow",
    protectedFromPullRequestMutation: false,
  }),
  "trivy-fs": Object.freeze({
    path: ".github/workflows/security-scan.yml",
    source: "required_workflow",
    protectedFromPullRequestMutation: false,
  }),
  "dependency-review": Object.freeze({
    path: ".github/workflows/security-scan.yml",
    source: "required_workflow",
    protectedFromPullRequestMutation: false,
  }),
});

function bound(value, limit = MAX_REPORT_DETAIL_CHARS) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function redactSensitiveValue(value, sensitiveValues = []) {
  let redacted = String(value ?? "");
  for (const sensitiveValue of Array.isArray(sensitiveValues) ? sensitiveValues : []) {
    if (typeof sensitiveValue !== "string" || sensitiveValue.length === 0) {
      continue;
    }
    redacted = redacted.split(sensitiveValue).join("[REDACTED]");
  }
  return redacted;
}

export function createGhSubprocessEnvironment(sourceEnvironment) {
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

function runGh(args, { input } = {}) {
  const childEnvironment = createGhSubprocessEnvironment({
    PATH: process.env.PATH,
    GH_TOKEN: readDelegatedGithubToken(process.env.NOEMA_MAINTAINER_TOKEN_PATH),
  });
  const completed = spawnSync("gh", args, {
    encoding: "utf8",
    env: childEnvironment,
    input,
    maxBuffer: MAX_GH_OUTPUT_BYTES,
    shell: false,
  });
  if (completed.error) {
    const detail = redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI could not start: ${bound(detail, MAX_ERROR_CHARS)}`);
  }
  if (completed.status !== 0) {
    const rawDetail = completed.stderr || completed.stdout || `exit ${completed.status}`;
    const detail = redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI failed: ${bound(detail, MAX_ERROR_CHARS)}`);
  }
  return completed.stdout.trim();
}

function runGhJson(args, options) {
  const raw = runGh(args, options);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`GitHub CLI returned invalid JSON: ${bound(error.message, MAX_ERROR_CHARS)}`);
  }
}

export function flattenArrayPages(pages) {
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated GitHub response must be an array of pages.");
  }
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) {
      throw new TypeError("Each paginated GitHub array page must be an array.");
    }
    return page;
  });
}

/** Preserve observed check-run time evidence without inventing chronology when GitHub omits it. */
function checkRunTimestamp(check) {
  const completedAt = typeof check?.completed_at === "string"
    ? Date.parse(check.completed_at)
    : Number.NaN;
  const startedAt = typeof check?.started_at === "string"
    ? Date.parse(check.started_at)
    : Number.NaN;
  const timestamps = [completedAt, startedAt].filter(Number.isFinite);
  return timestamps.length === 0 ? null : Math.max(...timestamps);
}

/** Order retries by GitHub's timestamp semantics; reject unknown chronology instead of inventing it. */
function checkRunChronologicalOrder(left, right) {
  const leftTime = checkRunTimestamp(left);
  const rightTime = checkRunTimestamp(right);
  if (leftTime === null || rightTime === null) {
    const invalid = leftTime === null ? left : right;
    throw new TypeError(
      `Check run chronology metadata is incomplete for id ${String(invalid?.id ?? "missing")}.`,
    );
  }
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  const leftId = Number(left?.id);
  const rightId = Number(right?.id);
  if (leftId === rightId) {
    return 0;
  }
  throw new TypeError(
    `Check run chronology is ambiguous for ids ${String(left?.id ?? "missing")} and ${String(right?.id ?? "missing")}.`,
  );
}

/** Build an exact API identity key without normalizing check-name or producer authority. */
function checkRunSuiteKey(check) {
  const checkId = Number(check?.id);
  const suiteId = Number(check?.check_suite?.id);
  const name = typeof check?.name === "string" ? check.name : "";
  const appSlug = typeof check?.app?.slug === "string" ? check.app.slug : "";
  if (
    !Number.isSafeInteger(checkId)
    || checkId <= 0
    || !Number.isSafeInteger(suiteId)
    || suiteId <= 0
    || !name
    || !appSlug
  ) {
    return null;
  }
  return `${suiteId}\u0000${appSlug}\u0000${name}`;
}

/** Preserve exact check-suite identity while selecting only the latest chronological retry for each check. */
export function latestCheckRunsBySuite(checkRuns) {
  const latestBySuite = new Map();
  for (const check of Array.isArray(checkRuns) ? checkRuns : []) {
    const key = checkRunSuiteKey(check);
    if (!key) {
      throw new TypeError(
        `Check run identity metadata is incomplete for id ${String(check?.id ?? "missing")}.`,
      );
    }
    const current = latestBySuite.get(key);
    if (!current || checkRunChronologicalOrder(current, check) < 0) {
      latestBySuite.set(key, check);
    }
  }
  return [...latestBySuite.values()].sort((left, right) => {
    const nameDelta = String(left?.name ?? "").localeCompare(String(right?.name ?? ""));
    if (nameDelta !== 0) {
      return nameDelta;
    }
    const suiteDelta = Number(left?.check_suite?.id || 0) - Number(right?.check_suite?.id || 0);
    if (suiteDelta !== 0) {
      return suiteDelta;
    }
    return Number(left?.id || 0) - Number(right?.id || 0);
  });
}

/** Accept a required-workflow run id only when URL identity and payload workflow_id agree exactly. */
function requiredWorkflowRunId(run, repository) {
  const workflowUrl = String(run?.workflow_url ?? "");
  const requiredWorkflowPrefix = `https://api.github.com/repos/${repository}/actions/required_workflows/`;
  if (!workflowUrl.startsWith(requiredWorkflowPrefix)) {
    return null;
  }
  const suffix = workflowUrl.slice(requiredWorkflowPrefix.length);
  if (!/^[1-9][0-9]*$/.test(suffix)) {
    return null;
  }
  const workflowId = Number(suffix);
  return Number.isSafeInteger(workflowId)
    && workflowId > 0
    && run?.workflow_id === workflowId
    ? workflowId
    : null;
}

/** Require live required-workflow metadata to match the canonical owner contract without normalization. */
function requiredWorkflowMetadataIsCanonical(metadata, workflowId) {
  return metadata?.workflow_id === workflowId
    && metadata?.repository_id === REQUIRED_MAIN_WORKFLOW.repository_id
    && metadata?.path === REQUIRED_MAIN_WORKFLOW.path
    && metadata?.ref === REQUIRED_MAIN_WORKFLOW.ref
    && metadata?.sha === REQUIRED_MAIN_WORKFLOW.sha
    && metadata?.ruleset_source_type === REQUIRED_MAIN_WORKFLOW.ruleset_source_type
    && metadata?.ruleset_source === REQUIRED_MAIN_WORKFLOW.ruleset_source
    && metadata?.state === "active"
    && typeof metadata?.repository === "string"
    && metadata.repository.startsWith(`${REQUIRED_MAIN_WORKFLOW.ruleset_source}/`);
}

/** Classify workflow source only after repository-local or required-workflow identity is proven exact. */
function workflowRunSource(run, repository) {
  const workflowUrl = String(run?.workflow_url ?? "");
  const repositoryWorkflowPrefix = `https://api.github.com/repos/${repository}/actions/workflows/`;
  const requiredWorkflowId = requiredWorkflowRunId(run, repository);
  if (requiredWorkflowId !== null) {
    return requiredWorkflowMetadataIsCanonical(
      run?.required_workflow_metadata,
      requiredWorkflowId,
    ) ? "required_workflow" : "unknown";
  }
  if (workflowUrl.startsWith(repositoryWorkflowPrefix)) {
    const suffix = workflowUrl.slice(repositoryWorkflowPrefix.length);
    if (!/^[1-9][0-9]*$/.test(suffix)) {
      return "unknown";
    }
    const workflowId = Number(suffix);
    return Number.isSafeInteger(workflowId)
      && workflowId > 0
      && run?.workflow_id === workflowId
      ? "repository_workflow"
      : "unknown";
  }
  return "unknown";
}

/** Bind workflow evidence to exactly one current PR association with the current head and base identities. */
function workflowRunMatchesTargetPullRequest(
  run,
  expectedPullNumber,
  expectedHeadSha,
  expectedBaseRef,
  expectedBaseSha,
) {
  if (
    !Number.isSafeInteger(expectedPullNumber)
    || expectedPullNumber <= 0
    || expectedBaseRef !== "main"
    || !fullShaPattern.test(String(expectedBaseSha ?? ""))
  ) {
    return false;
  }
  const pullRequests = Array.isArray(run?.pull_requests) ? run.pull_requests : [];
  if (pullRequests.length !== 1) {
    return false;
  }
  const association = pullRequests[0];
  return association?.number === expectedPullNumber
    && association?.head?.sha === expectedHeadSha
    && association?.base?.ref === expectedBaseRef
    && association?.base?.sha === expectedBaseSha;
}

/** Bind each check suite to the exact current-head, current-base, current-PR Actions workflow run that produced it. */
export function workflowAuthorityByCheckSuite(
  workflowRuns,
  repository,
  expectedHeadSha,
  expectedPullNumber,
  expectedBaseRef,
  expectedBaseSha,
) {
  const authorityBySuite = new Map();
  if (
    !repositoryPattern.test(String(repository ?? ""))
    || !fullShaPattern.test(String(expectedHeadSha ?? ""))
    || !Number.isSafeInteger(expectedPullNumber)
    || expectedPullNumber <= 0
    || expectedBaseRef !== "main"
    || !fullShaPattern.test(String(expectedBaseSha ?? ""))
  ) {
    return authorityBySuite;
  }
  for (const run of Array.isArray(workflowRuns) ? workflowRuns : []) {
    const suiteId = Number(run?.check_suite_id);
    if (!Number.isSafeInteger(suiteId) || suiteId <= 0) {
      continue;
    }
    const authority = (
      run?.event === "pull_request"
      && run?.head_sha === expectedHeadSha
      && workflowRunMatchesTargetPullRequest(
        run,
        expectedPullNumber,
        expectedHeadSha,
        expectedBaseRef,
        expectedBaseSha,
      )
    ) ? {
        path: String(run?.path ?? ""),
        source: workflowRunSource(run, repository),
      }
      : { path: "", source: "unknown" };
    if (authorityBySuite.has(suiteId)) {
      authorityBySuite.set(suiteId, { path: "", source: "unknown" });
      continue;
    }
    authorityBySuite.set(suiteId, authority);
  }
  return authorityBySuite;
}

/** Preserve the GitHub Actions producer only when the required check has canonical workflow provenance and App identity. */
export function commercialCheckAppSlug(check, workflowAuthorities, changedPaths) {
  const appSlug = String(check?.app?.slug ?? "");
  const name = String(check?.name ?? "").trim();
  const expected = requiredCheckWorkflowAuthority[name];
  if (!expected) {
    return appSlug;
  }
  if (appSlug !== "github-actions") {
    return appSlug;
  }
  if (check?.app?.id !== REQUIRED_MAIN_CHECK_INTEGRATION_ID) {
    return "untrusted-producer";
  }
  const suiteId = Number(check?.check_suite?.id);
  const authority = workflowAuthorities instanceof Map
    ? workflowAuthorities.get(suiteId)
    : null;
  if (!authority || authority.path !== expected.path || authority.source !== expected.source) {
    return "untrusted-workflow";
  }
  if (
    expected.protectedFromPullRequestMutation
    && Array.isArray(changedPaths)
    && changedPaths.includes(expected.path)
  ) {
    return "self-modified-workflow";
  }
  return appSlug;
}

function paginatedArray(endpoint) {
  const pages = runGhJson(["api", "--paginate", "--slurp", endpoint]);
  return flattenArrayPages(pages);
}

function paginatedObjectItems(endpoint, key) {
  const pages = runGhJson(["api", "--paginate", "--slurp", endpoint]);
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated GitHub response must be an array of object pages.");
  }
  return pages.flatMap((page) => {
    const items = page?.[key];
    if (!Array.isArray(items)) {
      throw new TypeError(`Paginated GitHub page is missing ${key}.`);
    }
    return items;
  });
}

/** Retain only organization-owned required-workflow observations needed to prove canonical source authority. */
function observedRequiredWorkflows(rules) {
  return (Array.isArray(rules) ? rules : [])
    .filter((rule) => (
      rule?.type === "workflows"
      && rule?.ruleset_source_type === REQUIRED_MAIN_WORKFLOW.ruleset_source_type
      && rule?.ruleset_source === REQUIRED_MAIN_WORKFLOW.ruleset_source
    ))
    .flatMap((rule) => {
      const workflows = rule?.parameters?.workflows;
      return Array.isArray(workflows) ? workflows : [];
    })
    .map((workflow) => ({
      repository_id: workflow?.repository_id,
      path: workflow?.path,
      ref: workflow?.ref,
      sha: workflow?.sha === undefined ? null : workflow.sha,
    }));
}

/** Accept exactly one ruleset observation that matches the canonical required-workflow authority tuple. */
function canonicalRequiredWorkflowObservation(rules) {
  const matches = observedRequiredWorkflows(rules).filter((workflow) => (
    workflow.repository_id === REQUIRED_MAIN_WORKFLOW.repository_id
    && workflow.path === REQUIRED_MAIN_WORKFLOW.path
    && workflow.ref === REQUIRED_MAIN_WORKFLOW.ref
    && workflow.sha === REQUIRED_MAIN_WORKFLOW.sha
  ));
  return matches.length === 1 ? matches[0] : null;
}

/** Resolve target required-workflow IDs through the live canonical owner repository and active main rules. */
function bindRequiredWorkflowMetadata(repository, workflowRuns) {
  const runs = Array.isArray(workflowRuns) ? workflowRuns : [];
  const requiredIds = new Set(
    runs.map((run) => requiredWorkflowRunId(run, repository)).filter((id) => id !== null),
  );
  if (requiredIds.size === 0) {
    return runs;
  }

  const rules = paginatedArray(`repos/${repository}/rules/branches/main?per_page=100`);
  const requiredWorkflow = canonicalRequiredWorkflowObservation(rules);
  if (!requiredWorkflow) {
    return runs;
  }

  const sourceRepository = runGhJson([
    "api",
    `repositories/${REQUIRED_MAIN_WORKFLOW.repository_id}`,
  ]);
  if (
    sourceRepository?.id !== REQUIRED_MAIN_WORKFLOW.repository_id
    || sourceRepository?.owner?.login !== REQUIRED_MAIN_WORKFLOW.ruleset_source
    || typeof sourceRepository?.full_name !== "string"
  ) {
    return runs;
  }

  const sourceWorkflows = paginatedObjectItems(
    `repos/${sourceRepository.full_name}/actions/workflows?per_page=100`,
    "workflows",
  );
  const canonicalWorkflowIds = new Set(sourceWorkflows
    .filter((workflow) => (
      workflow?.path === REQUIRED_MAIN_WORKFLOW.path
      && workflow?.state === "active"
      && Number.isSafeInteger(workflow?.id)
      && workflow.id > 0
    ))
    .map((workflow) => workflow.id));

  return runs.map((run) => {
    const workflowId = requiredWorkflowRunId(run, repository);
    if (workflowId === null || !canonicalWorkflowIds.has(workflowId)) {
      return run;
    }
    return {
      ...run,
      required_workflow_metadata: {
        workflow_id: workflowId,
        repository: sourceRepository.full_name,
        repository_id: sourceRepository.id,
        path: requiredWorkflow.path,
        ref: requiredWorkflow.ref,
        sha: requiredWorkflow.sha,
        ruleset_source_type: REQUIRED_MAIN_WORKFLOW.ruleset_source_type,
        ruleset_source: REQUIRED_MAIN_WORKFLOW.ruleset_source,
        state: "active",
      },
    };
  });
}

function isTrustedNoemaBot(review, trustedReviewerLogin) {
  const login = String(review?.user?.login ?? "").toLowerCase();
  const expectedLogin = String(trustedReviewerLogin ?? "").toLowerCase();
  return Boolean(expectedLogin)
    && review?.user?.type === "Bot"
    && login === expectedLogin;
}

/** Preserve exact reviewer login/state authority in GitHub REST list order so later blockers cannot be reordered away. */
export function latestReviewStates(reviews) {
  const decisions = new Map();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const reviewer = typeof review?.user?.login === "string" ? review.user.login : "";
    const state = typeof review?.state === "string" ? review.state : "";
    if (!reviewer) {
      continue;
    }
    if (state === "DISMISSED") {
      decisions.delete(reviewer);
    } else if (state === "APPROVED" || state === "CHANGES_REQUESTED") {
      decisions.set(reviewer, { reviewer, state });
    }
  }
  return [...decisions.values()].sort((left, right) => left.reviewer.localeCompare(right.reviewer));
}

/** Accept only the exact configured reviewer login and one exact credentialed exact-head Noema gate envelope. */
export function parseNoemaReviewDecision(reviews, expectedHeadSha, trustedReviewerLogin) {
  if (
    !fullShaPattern.test(String(expectedHeadSha ?? ""))
    || !botLoginPattern.test(String(trustedReviewerLogin ?? ""))
  ) {
    return null;
  }
  const expectedReviewerLogin = String(trustedReviewerLogin ?? "");
  let currentDecision = null;
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (
      review?.user?.login !== expectedReviewerLogin
      || !isTrustedNoemaBot(review, trustedReviewerLogin)
    ) {
      continue;
    }
    if (review?.commit_id !== expectedHeadSha) {
      continue;
    }
    const state = typeof review?.state === "string" ? review.state : "";
    if (state === "DISMISSED") {
      currentDecision = null;
      continue;
    }
    const body = String(review?.body ?? "");
    noemaMarkerPattern.lastIndex = 0;
    noemaMarkerEnvelopePattern.lastIndex = 0;
    const markers = [];
    const markerEnvelopes = [];
    let marker;
    while ((marker = noemaMarkerPattern.exec(body)) !== null) {
      markers.push(marker);
    }
    let markerEnvelope;
    while ((markerEnvelope = noemaMarkerEnvelopePattern.exec(body)) !== null) {
      markerEnvelopes.push(markerEnvelope[0]);
    }
    const hasCredential = body.includes(noemaCredentialMarker);
    if (!hasCredential && markerEnvelopes.length === 0) {
      continue;
    }
    currentDecision = null;
    if (
      markerEnvelopes.length !== 1
      || markers.length !== 1
      || markers[0][0] !== markerEnvelopes[0]
      || markers[0][1] !== expectedHeadSha
    ) {
      continue;
    }
    const markerStart = body.lastIndexOf(markerEnvelopes[0]);
    const credentialPrefix = body.slice(0, markerStart);
    const publisherCredentialBound = (
      credentialPrefix.endsWith(`- ${noemaCredentialMarker}\n\n`)
      || credentialPrefix.endsWith(`${noemaCredentialMarker}\n`)
    );
    if (!publisherCredentialBound) {
      continue;
    }
    const decision = markers[0][2];
    const compatible = decision === "approve"
      ? state === "APPROVED"
      : state === "CHANGES_REQUESTED";
    if (!compatible) {
      continue;
    }
    currentDecision = decision;
  }
  return currentDecision;
}

/** Preserve GitHub REST reverse-chronological Commit Status order without synthesizing timestamp chronology. */
export function latestStatuses(statuses) {
  const latestByContext = new Map();
  for (const status of Array.isArray(statuses) ? statuses : []) {
    const context = typeof status?.context === "string" ? status.context : "";
    if (context && !latestByContext.has(context)) {
      latestByContext.set(context, {
        context,
        state: typeof status?.state === "string" ? status.state : "",
      });
    }
  }
  return [...latestByContext.values()].sort((left, right) => left.context.localeCompare(right.context));
}

export function hasActiveNoemaReviewRun(runs, repository, pullNumber, headSha) {
  if (
    !repositoryPattern.test(String(repository ?? ""))
    || !Number.isInteger(Number(pullNumber))
    || Number(pullNumber) <= 0
    || !fullShaPattern.test(String(headSha ?? ""))
  ) {
    return false;
  }
  const expectedTitle = `Noema central review ${repository}#${Number(pullNumber)}@${headSha}`;
  return (Array.isArray(runs) ? runs : []).some((run) => (
    run?.event === "repository_dispatch"
    && activeWorkflowRunStatuses.has(String(run?.status ?? "").toLowerCase())
    && run?.display_title === expectedTitle
  ));
}

function fetchUnresolvedThreadCount(repository, pullNumber) {
  const [owner, name] = repository.split("/", 2);
  const pages = runGhJson([
    "api",
    "graphql",
    "--paginate",
    "--slurp",
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${pullNumber}`,
    "-f",
    `query=${reviewThreadQuery}`,
  ]);
  if (!Array.isArray(pages)) {
    throw new TypeError("Review-thread GraphQL response must contain every page.");
  }
  return pages.reduce((count, page) => {
    const threads = page?.data?.repository?.pullRequest?.reviewThreads?.nodes;
    if (!Array.isArray(threads)) {
      throw new TypeError("Review-thread GraphQL page is incomplete.");
    }
    return count + threads.filter((thread) => thread?.isResolved !== true).length;
  }, 0);
}

function fetchPullRequest(repository, pullNumber) {
  return runGhJson(["api", `repos/${repository}/pulls/${pullNumber}`]);
}

function listOpenPullRequests(repository) {
  return paginatedArray(`repos/${repository}/pulls?state=open&per_page=100`);
}

/** Assemble fail-closed current PR evidence only after complete changed-file, workflow, review, and status authority is observed. */
function fetchPullRequestSnapshot(repository, pullNumber, trustedNoemaReviewerLogin) {
  const pull = fetchPullRequest(repository, pullNumber);
  const headSha = String(pull?.head?.sha ?? "");
  const baseRef = String(pull?.base?.ref ?? "");
  const baseSha = String(pull?.base?.sha ?? "");
  if (!fullShaPattern.test(headSha)) {
    throw new Error(`Pull request #${pullNumber} did not expose a full head SHA.`);
  }
  const changedFiles = paginatedArray(
    `repos/${repository}/pulls/${pullNumber}/files?per_page=100`,
  );
  if (!Number.isSafeInteger(pull?.changed_files) || pull.changed_files !== changedFiles.length) {
    throw new Error(`Pull request #${pullNumber} changed-file evidence is incomplete.`);
  }
  const changedPaths = changedFiles.map((file) => String(file?.filename ?? ""));
  const rawCheckRuns = latestCheckRunsBySuite(paginatedObjectItems(
    `repos/${repository}/commits/${headSha}/check-runs?filter=all&per_page=100`,
    "check_runs",
  ));
  const workflowRuns = paginatedObjectItems(
    `repos/${repository}/actions/runs?head_sha=${headSha}&event=pull_request&per_page=100`,
    "workflow_runs",
  );
  const workflowAuthorities = workflowAuthorityByCheckSuite(
    bindRequiredWorkflowMetadata(repository, workflowRuns),
    repository,
    headSha,
    pullNumber,
    baseRef,
    baseSha,
  );
  const checkRuns = rawCheckRuns.map((check) => ({
    name: String(check?.name ?? ""),
    appSlug: commercialCheckAppSlug(check, workflowAuthorities, changedPaths),
    status: String(check?.status ?? ""),
    conclusion: check?.conclusion == null ? null : String(check.conclusion),
  }));
  const rawStatuses = paginatedArray(
    `repos/${repository}/commits/${headSha}/statuses?per_page=100`,
  );
  const reviews = paginatedArray(
    `repos/${repository}/pulls/${pullNumber}/reviews?per_page=100`,
  );

  return {
    repository,
    number: pullNumber,
    title: bound(pull?.title || `Pull request #${pullNumber}`, 240),
    state: String(pull?.state ?? ""),
    draft: pull?.draft,
    baseRef,
    baseSha,
    headRepository: String(pull?.head?.repo?.full_name ?? ""),
    headSha,
    mergeable: pull?.mergeable,
    mergeableState: String(pull?.mergeable_state ?? ""),
    unresolvedThreadCount: fetchUnresolvedThreadCount(repository, pullNumber),
    latestReviewStates: latestReviewStates(reviews),
    noemaReviewDecision: parseNoemaReviewDecision(
      reviews,
      headSha,
      trustedNoemaReviewerLogin,
    ),
    checkRuns,
    statuses: latestStatuses(rawStatuses),
  };
}

/** Revalidate exact live head identity and, when supplied, base SHA immediately before an authority-bearing write. */
function assertLiveHead(repository, pullNumber, expectedHeadSha, expectedBaseSha = null) {
  const live = fetchPullRequest(repository, pullNumber);
  if (
    !live
    || live?.state !== "open"
    || live?.base?.ref !== "main"
    || live?.head?.sha !== expectedHeadSha
    || live?.head?.repo?.full_name !== repository
    || (expectedBaseSha !== null && live?.base?.sha !== expectedBaseSha)
  ) {
    throw new Error(
      `Pull request #${pullNumber} changed before the write; expected open main ${expectedHeadSha}`
      + (expectedBaseSha === null ? "." : ` on base ${expectedBaseSha}.`),
    );
  }
}

function fetchCentralReviewRuns(repository) {
  return paginatedObjectItems(
    `repos/${repository}/actions/workflows/central-review.yml/runs?event=repository_dispatch&per_page=100`,
    "workflow_runs",
  );
}

function dispatchNoemaReview(repository, pullNumber, expectedHeadSha) {
  assertLiveHead(repository, pullNumber, expectedHeadSha);
  const payload = {
    event_type: "noema-review",
    client_payload: {
      target_repository: repository,
      pr_number: pullNumber,
      pr_head_sha: expectedHeadSha,
    },
  };
  runGh(
    ["api", "-X", "POST", `repos/${repository}/dispatches`, "--input", "-"],
    { input: JSON.stringify(payload) },
  );
}

function dispatchProductDevelopment(repository) {
  const activeRuns = paginatedObjectItems(
    `repos/${repository}/actions/workflows/hourly-product-development.yml/runs?per_page=100`,
    "workflow_runs",
  );
  if (activeRuns.some((run) => (
    activeWorkflowRunStatuses.has(String(run?.status ?? "").toLowerCase())
  ))) {
    return false;
  }
  runGh(
    [
      "api", "-X", "POST",
      `repos/${repository}/actions/workflows/hourly-product-development.yml/dispatches`,
      "--input", "-",
    ],
    { input: JSON.stringify({ ref: "main", inputs: { dry_run: "false" } }) },
  );
  return true;
}

export function shouldDispatchProductDevelopment(apply, operationalErrorCount) {
  return apply === true
    && Number.isInteger(operationalErrorCount)
    && operationalErrorCount === 0;
}

/** Revalidate the exact live head immediately before issuing a SHA-bound normal merge request. */
function mergePullRequest(repository, snapshot, trustedNoemaReviewerLogin) {
  const expectedHeadSha = snapshot.headSha;
  assertLiveHead(repository, snapshot.number, expectedHeadSha);
  const freshSnapshot = fetchPullRequestSnapshot(
    repository,
    snapshot.number,
    trustedNoemaReviewerLogin,
  );
  const freshDecision = evaluatePullRequest(freshSnapshot);
  if (freshSnapshot.headSha !== expectedHeadSha || freshDecision.action !== "merge") {
    throw new Error(
      `Pull request #${snapshot.number} no longer satisfies the exact-head merge decision.`,
    );
  }
  assertLiveHead(repository, snapshot.number, expectedHeadSha, freshSnapshot.baseSha);
  const payload = {
    commit_title: `${snapshot.title} (#${snapshot.number})`,
    commit_message: "Merged by Noema's hourly commercial-readiness loop after exact-head validation.",
    merge_method: "merge",
    sha: expectedHeadSha,
  };
  const result = runGhJson(
    ["api", "-X", "PUT", `repos/${repository}/pulls/${snapshot.number}/merge`, "--input", "-"],
    { input: JSON.stringify(payload) },
  );
  if (result?.merged !== true) {
    throw new Error(
      `GitHub refused pull request #${snapshot.number}: ${bound(result?.message || "unknown reason")}`,
    );
  }
  return String(result.sha ?? "");
}

function parseArguments(argv) {
  let apply = false;
  let reportPath = "artifacts/commercial-readiness/hourly-loop-report.json";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--report") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--report requires a file path.");
      }
      reportPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { apply, reportPath: resolve(reportPath) };
}

function appendWorkflowOutputs(reportPath, report) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(
      outputPath,
      [
        `open_pull_request_count=${report.openPullRequestCount}`,
        `remaining_open_pull_request_count=${report.remainingOpenPullRequestCount ?? "unknown"}`,
        `report_path=${reportPath}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

function writeSummary(report) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  const lines = [
    "## Noema commercial-readiness loop",
    "",
    `- Open pull requests inspected: ${report.openPullRequestCount}`,
    `- Open pull requests remaining: ${report.remainingOpenPullRequestCount ?? "unknown"}`,
    `- Apply mode: ${report.apply ? "enabled" : "dry run"}`,
    "",
  ];
  if (report.results.length === 0) {
    lines.push("No pull requests were open; the workflow may continue with report-only readiness audits.");
  } else {
    lines.push("| PR | Result | Detail |", "| --- | --- | --- |");
    for (const result of report.results) {
      const detail = result.reasons?.map((reason) => reason.code).join(", ")
        || result.detail
        || "validated";
      lines.push(
        `| #${result.number} | ${result.result} | ${bound(detail, 300).replaceAll("|", "\\|")} |`,
      );
    }
  }
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function writeReport(reportPath, report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  appendWorkflowOutputs(reportPath, report);
  writeSummary(report);
}

/** Execute one commercial-readiness pass while preserving exact-head evidence and fail-closed merge authority. */
export function main(argv = process.argv.slice(2)) {
  const { apply, reportPath } = parseArguments(argv);
  const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
  if (!repositoryPattern.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must identify a ContextualWisdomLab repository.");
  }
  const trustedNoemaReviewerLogin = String(process.env.NOEMA_REVIEWER_LOGIN ?? "").trim();
  if (!botLoginPattern.test(trustedNoemaReviewerLogin)) {
    throw new Error("NOEMA_REVIEWER_LOGIN must be the exact trusted GitHub App bot login ending in [bot].");
  }

  const openPullRequests = listOpenPullRequests(repository);
  const report = {
    schemaVersion: 1,
    repository,
    generatedAt: new Date().toISOString(),
    apply,
    openPullRequestCount: openPullRequests.length,
    remainingOpenPullRequestCount: null,
    results: [],
  };
  const operationalErrors = [];

  for (const pull of openPullRequests) {
    const pullNumber = Number(pull?.number);
    try {
      if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
        throw new Error("Open pull-request listing contained an invalid number.");
      }
      const snapshot = fetchPullRequestSnapshot(
        repository,
        pullNumber,
        trustedNoemaReviewerLogin,
      );
      const decision = evaluatePullRequest(snapshot);
      const result = {
        number: pullNumber,
        headSha: snapshot.headSha,
        decision: decision.action,
        result: decision.action,
        reasons: decision.reasons,
      };

      if (apply && decision.action === "request_review") {
        const activeRuns = fetchCentralReviewRuns(repository);
        if (hasActiveNoemaReviewRun(activeRuns, repository, pullNumber, snapshot.headSha)) {
          result.result = "review_in_progress";
          result.detail = "An exact-target Noema central review is already active.";
        } else {
          dispatchNoemaReview(repository, pullNumber, snapshot.headSha);
          result.result = "review_dispatched";
          result.detail = "Dispatched trusted Noema review for the exact current head.";
        }
      } else if (apply && decision.action === "merge") {
        const mergeSha = mergePullRequest(
          repository,
          snapshot,
          trustedNoemaReviewerLogin,
        );
        result.result = "merged";
        result.detail = `Merged normally at ${mergeSha || "GitHub-generated commit"}.`;
      }
      report.results.push(result);
    } catch (error) {
      const detail = bound(error?.message || error, MAX_ERROR_CHARS);
      report.results.push({
        number: Number.isInteger(pullNumber) ? pullNumber : null,
        result: "operational_error",
        reasons: [{ code: "operational_error", detail }],
      });
      operationalErrors.push(detail);
    }
  }

  try {
    report.remainingOpenPullRequestCount = listOpenPullRequests(repository).length;
  } catch (error) {
    const detail = bound(error?.message || error, MAX_ERROR_CHARS);
    operationalErrors.push(detail);
    report.results.push({
      number: null,
      result: "operational_error",
      reasons: [{ code: "remaining_queue_unavailable", detail }],
    });
  }

  if (shouldDispatchProductDevelopment(apply, operationalErrors.length)) {
    try {
      report.productDevelopmentDispatched = dispatchProductDevelopment(repository);
    } catch (error) {
      const detail = bound(error?.message || error, MAX_ERROR_CHARS);
      operationalErrors.push(detail);
      report.results.push({
        number: null,
        result: "operational_error",
        reasons: [{ code: "product_development_dispatch_failed", detail }],
      });
    }
  }

  writeReport(reportPath, report);
  console.log(JSON.stringify({
    repository,
    openPullRequestCount: report.openPullRequestCount,
    remainingOpenPullRequestCount: report.remainingOpenPullRequestCount,
    results: report.results.map(({ number, result }) => ({ number, result })),
    reportPath,
  }));

  if (operationalErrors.length > 0) {
    throw new Error(`${operationalErrors.length} operational error(s) occurred; inspect ${reportPath}.`);
  }
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(bound(error?.message || error, MAX_ERROR_CHARS));
    process.exitCode = 1;
  }
}
