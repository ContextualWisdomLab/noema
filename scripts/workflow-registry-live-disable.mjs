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
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("workflow registry GitHub response exceeds the bounded size limit");
    }

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("workflow registry GitHub response returned invalid JSON");
    }
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
 * The operator collects a full exact-main audit, immediately refreshes raw registry
 * identities, builds process-local mutation authority, revalidates main plus workflow
 * state around the mutation, and then performs a second full audit before returning a receipt.
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

  const audit = await input.collectAudit();
  const exactMain = audit?.default_branch_sha;
  const liveWorkflows = await input.collectLiveWorkflows();
  const plan = buildWorkflowDisablementPlan({
    audit,
    expectedRepository: repository,
    expectedDefaultBranchSha: exactMain,
    liveWorkflows,
  });
  if (plan.status !== "PASS") {
    const firstFailure = plan.failures?.[0]?.code ?? "unknown";
    throw new Error(`fresh workflow disablement plan is non-authorizing: ${firstFailure}`);
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
