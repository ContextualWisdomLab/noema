#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";
import {
  buildWorkflowDisablementPlan,
  createGithubWorkflowDisablementTransport,
  executeWorkflowDisablement,
} from "./workflow-registry-disable-plan.mjs";
import {
  collectLiveWorkflowRegistryAudit,
  workflowPageFromResponse,
} from "./workflow-registry-live-audit.mjs";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const PER_PAGE = 100;
const MAX_PAGES = 1_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

function validWorkflowId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Require a complete schema-v1 post-audit envelope and return residual orphan
 * identities that the operator can use for the next single-id invocation.
 * A receipt is not honest if this workflow is still an active orphan, if PASS
 * and FAIL contradict the residual failure list, or if the only planned
 * candidate did not produce a clean registry audit.
 *
 * @param {object} input authentic plan, requested workflow id, and post-audit
 * @returns {{remainingFailureCodes: string[], remainingActiveOrphanIds: number[]}}
 */
function honestPostAuditResiduals(input) {
  const postAudit = input?.postAudit;
  if (postAudit?.schema_version !== 1) {
    throw new Error("full post-disablement audit is not a schema-v1 envelope");
  }
  if (postAudit.status !== "PASS" && postAudit.status !== "FAIL") {
    throw new Error("full post-disablement audit did not retain an exact PASS or FAIL status");
  }
  if (!Array.isArray(postAudit.failures)) {
    throw new Error("full post-disablement audit did not retain a complete failure envelope");
  }

  const remainingFailureCodes = [];
  const remainingActiveOrphanIds = [];
  for (const failure of postAudit.failures) {
    if (!isRecord(failure) || typeof failure.code !== "string") {
      throw new Error("full post-disablement audit contained a malformed residual failure");
    }
    remainingFailureCodes.push(failure.code);
    if (failure.code === "active_orphan_workflow") {
      if (failure.workflow_id === input.workflowId) {
        throw new Error(
          "full post-disablement audit still classifies the disabled workflow as an active orphan",
        );
      }
      if (validWorkflowId(failure.workflow_id)) {
        remainingActiveOrphanIds.push(failure.workflow_id);
      }
    }
  }

  if (postAudit.status === "PASS" && remainingFailureCodes.length > 0) {
    throw new Error("full post-disablement audit PASS status contradicts residual failures");
  }
  if (postAudit.status === "FAIL" && remainingFailureCodes.length === 0) {
    throw new Error("full post-disablement audit FAIL status has no residual failures");
  }
  if (input.plan.disablements.length === 1 && postAudit.status !== "PASS") {
    throw new Error("single-candidate disablement did not produce a clean post-disablement audit");
  }

  return {
    remainingFailureCodes,
    remainingActiveOrphanIds: [...new Set(remainingActiveOrphanIds)].sort((left, right) => left - right),
  };
}

function boundedError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\bbearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 2_048);
}

/**
 * Read a GitHub response without permitting a chunked or untrusted-length body
 * to exceed the operator's memory/read authority before rejection.
 *
 * @param {Response | {body?: unknown, arrayBuffer: () => Promise<ArrayBuffer>}} response fetch response
 * @returns {Promise<Uint8Array>} bounded response bytes
 */
async function readBoundedResponseBytes(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("workflow registry GitHub response exceeds the bounded size limit");
    }
    return bytes;
  }

  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel("workflow registry GitHub response exceeds the bounded size limit");
      throw new Error("workflow registry GitHub response exceeds the bounded size limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Create a bounded, repository-pinned GitHub JSON reader for the live operator.
 * The delegated token is closure-private and never copied into process environment.
 *
 * @param {{token: string, fetchImpl?: typeof fetch}} input delegated token and fetch primitive
 * @returns {(endpoint: string) => Promise<unknown>} exact-repository JSON reader
 */
export function createWorkflowRegistryGithubJsonReader(input) {
  if (typeof input?.token !== "string" || input.token.length === 0) {
    throw new Error("workflow registry GitHub reader requires a delegated token");
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("workflow registry GitHub reader requires fetch capability");
  }
  const token = input.token;

  return async (endpoint) => {
    if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.includes("\\")) {
      throw new Error("workflow registry GitHub endpoint is invalid");
    }
    const url = new URL(endpoint, `${GITHUB_API_ROOT}/`);
    if (
      url.origin !== GITHUB_API_ROOT
      || !url.pathname.startsWith(`/repos/${EXPECTED_REPOSITORY}/`)
      || url.username
      || url.password
      || url.hash
    ) {
      throw new Error("workflow registry GitHub endpoint escapes the Noema repository boundary");
    }

    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "ContextualWisdomLab-Noema-workflow-registry-operator",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error?.name === "TimeoutError") {
        throw new Error("workflow registry GitHub request timed out");
      }
      throw new Error("workflow registry GitHub request failed before receiving an HTTP response");
    }
    if (!response.ok) {
      throw new Error(`workflow registry GitHub request failed with HTTP ${response.status}`);
    }

    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_RESPONSE_BYTES) {
      throw new Error("workflow registry GitHub response exceeds the bounded size limit");
    }
    const bytes = await readBoundedResponseBytes(response);

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error("workflow registry GitHub response contains invalid UTF-8");
    }

    let duplicateKeys;
    try {
      duplicateKeys = hasDuplicateJsonObjectKeys(text);
    } catch {
      throw new Error("workflow registry GitHub response returned invalid JSON");
    }
    if (duplicateKeys) {
      throw new Error("workflow registry GitHub response contains duplicate decoded JSON keys");
    }
    return JSON.parse(text);
  };
}

/**
 * Re-read the complete workflow registry immediately before building mutation authority.
 * Every page must agree on total count and retained records must exactly match that total.
 *
 * @param {{repository?: string, ghJson: (endpoint: string) => Promise<unknown>}} input repository and reader
 * @returns {Promise<object[]>} complete fresh raw workflow registry
 */
export async function collectLiveWorkflowRecords(input) {
  const repository = input?.repository ?? EXPECTED_REPOSITORY;
  if (repository !== EXPECTED_REPOSITORY || typeof input?.ghJson !== "function") {
    throw new Error("live workflow registry collection is restricted to ContextualWisdomLab/noema");
  }

  const workflows = [];
  let expectedTotal;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const parsed = workflowPageFromResponse(
      await input.ghJson(`repos/${repository}/actions/workflows?per_page=${PER_PAGE}&page=${page}`),
      page,
      PER_PAGE,
    );
    if (expectedTotal === undefined) expectedTotal = parsed.totalCount;
    if (parsed.totalCount !== expectedTotal) {
      throw new Error("workflow registry total changed during immediate pre-mutation refresh");
    }
    workflows.push(...parsed.workflows);
    if (!parsed.hasNext) {
      if (workflows.length !== expectedTotal) {
        throw new Error("workflow registry refresh did not retain the advertised record count");
      }
      return workflows;
    }
  }
  throw new Error("workflow registry pagination exceeded the bounded page limit");
}

/**
 * Execute one and only one requested active-orphan workflow disablement.
 * The operator refreshes the raw registry first, then collects the full exact-main
 * audit so active-PR ownership is the freshest broad state before mutation authority
 * is built. The executor then revalidates main plus workflow state around the
 * mutation and performs a second full audit before returning a receipt.
 *
 * @param {object} input exact repository, workflow id, audit/live collectors, and transport
 * @returns {Promise<object>} bounded postcondition receipt
 */
export async function runWorkflowRegistryDisablement(input) {
  const repository = input?.repository ?? EXPECTED_REPOSITORY;
  const workflowId = input?.workflowId;
  if (repository !== EXPECTED_REPOSITORY) {
    throw new Error(`workflow disablement is restricted to ${EXPECTED_REPOSITORY}`);
  }
  if (!validWorkflowId(workflowId)) {
    throw new Error("requested workflow id must be a positive safe integer");
  }
  if (typeof input?.collectAudit !== "function" || typeof input?.collectLiveWorkflows !== "function") {
    throw new Error("workflow disablement operator is missing fresh evidence collectors");
  }
  const transport = input?.transport;
  if (
    typeof transport?.revalidateDefaultBranch !== "function"
    || typeof transport?.revalidateWorkflow !== "function"
    || typeof transport?.disableWorkflow !== "function"
  ) {
    throw new Error("workflow disablement operator is missing authorized transport");
  }

  const liveWorkflows = await input.collectLiveWorkflows();
  const audit = await input.collectAudit();
  const exactMain = audit?.default_branch_sha;
  const plan = buildWorkflowDisablementPlan({
    audit,
    expectedRepository: repository,
    expectedDefaultBranchSha: exactMain,
    liveWorkflows,
  });
  if (plan.status !== "PASS") {
    throw new Error(`fresh workflow disablement plan is non-authorizing: ${plan.failures[0].code}`);
  }

  const candidate = plan.disablements.find((item) => item.workflow_id === workflowId);
  if (!candidate) {
    throw new Error("requested workflow is not an exact active-orphan candidate");
  }

  const mutation = await executeWorkflowDisablement({
    plan,
    candidate,
    revalidateDefaultBranch: transport.revalidateDefaultBranch,
    revalidateWorkflow: transport.revalidateWorkflow,
    disableWorkflow: transport.disableWorkflow,
  });

  const postAudit = await input.collectAudit();
  if (postAudit?.repository_full_name !== repository) {
    throw new Error("repository identity changed during post-disablement verification");
  }
  if (postAudit?.default_branch_sha !== plan.default_branch_sha) {
    throw new Error("protected main changed during post-disablement verification");
  }
  const postWorkflow = Array.isArray(postAudit?.workflows)
    ? postAudit.workflows.find((item) => item?.workflow_id === workflowId)
    : undefined;
  if (
    postWorkflow?.workflow_path !== candidate.workflow_path
    || postWorkflow?.workflow_state !== "disabled_manually"
    || postWorkflow?.classification !== "disabled_registry_record"
  ) {
    throw new Error("full post-disablement audit did not retain the exact disabled workflow identity");
  }

  const residuals = honestPostAuditResiduals({
    plan,
    workflowId,
    postAudit,
  });

  return Object.freeze({
    schema_version: 1,
    repository_full_name: repository,
    protected_main_sha: plan.default_branch_sha,
    workflow_id: mutation.workflow_id,
    workflow_path: mutation.workflow_path,
    prior_state: mutation.prior_state,
    final_state: mutation.final_state,
    mutation: mutation.mutation,
    post_audit_status: postAudit.status,
    remaining_failure_codes: Object.freeze(residuals.remainingFailureCodes),
    remaining_active_orphan_ids: Object.freeze(residuals.remainingActiveOrphanIds),
  });
}

/**
 * Operator entrypoint. The target workflow ID is an explicit argument and the
 * short-lived delegated GitHub capability comes only from the reviewed token file.
 * No batch mode exists: each invocation can mutate at most one exact audited orphan.
 *
 * @returns {Promise<object>} verified disablement receipt
 */
export async function main() {
  const repository = String(process.env.GITHUB_REPOSITORY ?? EXPECTED_REPOSITORY).trim();
  const tokenPath = String(process.env.NOEMA_MAINTAINER_TOKEN_PATH ?? "").trim();
  const workflowId = Number(process.argv[2] ?? "");
  if (repository !== EXPECTED_REPOSITORY) {
    throw new Error(`workflow disablement is restricted to ${EXPECTED_REPOSITORY}`);
  }
  if (!validWorkflowId(workflowId)) {
    throw new Error("requested workflow id must be a positive safe integer");
  }
  const token = readDelegatedGithubToken(tokenPath);
  const ghJson = createWorkflowRegistryGithubJsonReader({ token });
  const transport = createGithubWorkflowDisablementTransport({
    token,
    fetchImpl: globalThis.fetch,
  });
  const collectAudit = () => collectLiveWorkflowRegistryAudit({
    repository,
    defaultBranch: "main",
    ghJson,
  });
  const receipt = await runWorkflowRegistryDisablement({
    repository,
    workflowId,
    collectAudit,
    collectLiveWorkflows: () => collectLiveWorkflowRecords({ repository, ghJson }),
    transport,
  });
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

/**
 * Execute the live-disable CLI with isolated error and exit-code boundaries.
 *
 * @param {{mainFn?: () => Promise<unknown>, stderr?: (value: unknown) => void, setExitCode?: (code: number) => void}} [options]
 * @returns {Promise<unknown>} operation result or undefined after a bounded failure
 */
export async function startCli({
  mainFn = main,
  stderr = console.error,
  setExitCode = (code) => { process.exitCode = code; },
} = {}) {
  try {
    return await mainFn();
  } catch (error) {
    stderr(`workflow-registry-disable failed: ${boundedError(error)}`);
    setExitCode(1);
    return undefined;
  }
}

/**
 * Dispatch the CLI only when this module is the process entrypoint.
 *
 * @param {{scriptUrl?: string, argv?: string[], pathToFileUrlFn?: (path: string) => {href: string}, starter?: () => unknown}} [options]
 * @returns {boolean} whether direct-entry execution was selected
 */
export function runIfDirect({
  scriptUrl = import.meta.url,
  argv = process.argv,
  pathToFileUrlFn = (value) => pathToFileURL(resolve(value)),
  starter = startCli,
} = {}) {
  const invokedAsScript = (
    typeof argv[1] === "string"
    && argv[1].length > 0
    && pathToFileUrlFn(argv[1]).href === scriptUrl
  );
  if (invokedAsScript) void starter();
  return invokedAsScript;
}

runIfDirect();
