import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const WORKFLOW_PATH_PREFIX = ".github/workflows/";
const LOWERCASE_SHA_40 = /^[0-9a-f]{40}$/;
const ISO_UTC_MILLISECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const AUTHENTIC_PLANS = new WeakSet();

/**
 * Return whether an unknown value is a non-null, non-array object record.
 *
 * @param {unknown} value value to classify
 * @returns {boolean} true only for object records that can safely expose fields
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deep-freeze the mutable array members of a disablement plan and optionally
 * register the exact frozen object as process-local mutation authority.
 *
 * @param {object} plan plan-like value with disablements and failures arrays
 * @param {boolean} authenticate whether the returned object may authorize execution
 * @returns {object} immutable plan instance
 */
function freezePlan(plan, authenticate = false) {
  const disablements = Object.freeze(
    plan.disablements.map((disablement) => Object.freeze({ ...disablement })),
  );
  const failures = Object.freeze(
    plan.failures.map((failure) => Object.freeze({ ...failure })),
  );
  const frozen = Object.freeze({ ...plan, disablements, failures });
  if (authenticate) AUTHENTIC_PLANS.add(frozen);
  return frozen;
}

/**
 * Construct an immutable fail-closed plan that carries one bounded diagnostic.
 *
 * @param {unknown} repository repository identity observed by the caller
 * @param {unknown} defaultBranchSha protected-main identity observed by the caller
 * @param {string} code stable machine-readable failure code
 * @param {string} detail beginner-readable failure explanation
 * @returns {object} immutable non-authorizing failure plan
 */
function failedPlan(repository, defaultBranchSha, code, detail) {
  return freezePlan({
    status: "FAIL",
    repository_full_name: repository ?? null,
    default_branch_sha: defaultBranchSha ?? null,
    disablements: [],
    failures: [{ code, detail }],
  });
}

/**
 * Validate a GitHub workflow numeric identity without coercion.
 *
 * @param {unknown} value proposed workflow ID
 * @returns {boolean} true only for positive safe integers
 */
function validWorkflowId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Validate the narrow repository workflow-path language accepted for mutation.
 *
 * Paths must name one YAML file directly below `.github/workflows/`; nested,
 * traversal, backslash, NUL, and non-YAML paths are deliberately refused.
 *
 * @param {unknown} value proposed workflow path
 * @returns {boolean} true only for a canonical mutable repository workflow path
 */
function validWorkflowPath(value) {
  if (
    typeof value !== "string"
    || !value.startsWith(WORKFLOW_PATH_PREFIX)
    || !/\.ya?ml$/.test(value)
    || value.includes("\\")
    || value.includes("\0")
  ) {
    return false;
  }

  const relativePath = value.slice(WORKFLOW_PATH_PREFIX.length);
  const pathSegments = relativePath.split("/");
  return (
    pathSegments.length === 1
    && pathSegments[0].length > 0
    && pathSegments[0] !== "."
    && pathSegments[0] !== ".."
  );
}

/**
 * Validate the canonical UTC millisecond timestamp required by audit evidence.
 *
 * @param {unknown} value proposed observation timestamp
 * @returns {boolean} true only for a real canonical ISO-8601 UTC millisecond value
 */
function validObservedAt(value) {
  if (typeof value !== "string" || !ISO_UTC_MILLISECOND.test(value)) return false;

  const observedAtMs = Date.parse(value);
  return !Number.isNaN(observedAtMs) && new Date(observedAtMs).toISOString() === value;
}

/**
 * Validate complete, ordered pagination receipts from the registry collector.
 *
 * @param {unknown} value proposed receipt array
 * @returns {boolean} true only when pages are contiguous and `hasNext` is coherent
 */
function validPaginationReceipts(value) {
  if (!Array.isArray(value) || value.length === 0) return false;

  return value.every((receipt, index) => (
    isRecord(receipt)
    && receipt.page === index + 1
    && Number.isSafeInteger(receipt.itemCount)
    && receipt.itemCount >= 0
    && typeof receipt.hasNext === "boolean"
    && receipt.hasNext === (index < value.length - 1)
  ));
}

/**
 * Test whether a plan is the exact process-local object produced by this module.
 *
 * @param {unknown} plan plan-like value presented for privileged execution
 * @returns {boolean} true only for a locally authenticated plan object
 */
function validPlanAuthority(plan) {
  return AUTHENTIC_PLANS.has(plan);
}

/**
 * Create the least-authority GitHub REST transport required by the workflow
 * disablement executor. The delegated token remains closure-private, and every
 * request is pinned to Noema plus the current GitHub REST API version, a bounded
 * deadline, no redirect following, no cache reuse, and the endpoint's exact
 * documented success status. This transport does not discover candidates or
 * weaken the executor's exact-main, exact-workflow, and post-disablement checks.
 *
 * @param {object} input delegated token and fetch-compatible request primitive
 * @returns {object} frozen exact-revalidation and disablement capabilities
 */
export function createGithubWorkflowDisablementTransport(input) {
  if (typeof input?.fetchImpl !== "function") {
    throw new Error("workflow disablement transport is invalid");
  }
  if (typeof input?.token !== "string" || input.token.length === 0) {
    throw new Error("workflow disablement transport is invalid");
  }

  const fetchImpl = input.fetchImpl;
  const token = input.token;
  const headers = Object.freeze({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  });

  /**
   * Refuse any repository identity outside this Noema-specific capability.
   *
   * @param {unknown} repository requested repository identity
   * @returns {void}
   */
  function requireRepository(repository) {
    if (repository !== EXPECTED_REPOSITORY) {
      throw new Error("workflow disablement transport repository identity is invalid");
    }
  }

  /**
   * Refuse malformed workflow IDs before network or mutation authority is used.
   *
   * @param {unknown} workflowId requested workflow identity
   * @returns {void}
   */
  function requireWorkflowId(workflowId) {
    if (!validWorkflowId(workflowId)) {
      throw new Error("workflow disablement transport workflow identity is invalid");
    }
  }

  /**
   * Perform one bounded GitHub REST request with exact status-code semantics.
   *
   * Raw network exceptions and response bodies are intentionally not propagated,
   * preventing delegated credentials or untrusted remote data from entering logs.
   *
   * @param {string} path repository-relative GitHub REST endpoint path
   * @param {string} method HTTP method required by the exact endpoint
   * @param {number} expectedStatus sole accepted HTTP success status
   * @returns {Promise<Response>} successful response matching the exact status
   */
  async function request(path, method, expectedStatus) {
    let response;
    try {
      response = await fetchImpl(
        `${GITHUB_API_ROOT}/repos/${EXPECTED_REPOSITORY}${path}`,
        {
          method,
          headers,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      if (error?.name === "TimeoutError") {
        throw new Error("GitHub workflow disablement transport request timed out");
      }
      throw new Error(
        "GitHub workflow disablement transport request failed before receiving an HTTP response",
      );
    }
    if (!response.ok) {
      throw new Error(
        `GitHub workflow disablement transport request failed with HTTP ${response.status}`,
      );
    }
    if (response.status !== expectedStatus) {
      throw new Error(
        `GitHub workflow disablement transport expected HTTP ${expectedStatus} but received HTTP ${response.status}`,
      );
    }
    return response;
  }

  /**
   * Parse a successful GitHub JSON response through the same bounded byte-level
   * boundary used by the live registry collector. Response size, UTF-8 validity,
   * duplicate decoded object keys, and JSON syntax are all fail-closed before
   * any remote field can become protected-main or workflow mutation evidence.
   *
   * @param {Response} response successful GitHub response
   * @returns {Promise<unknown>} parsed JSON value
   */
  async function parseResponseJson(response) {
    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_RESPONSE_BYTES) {
      throw new Error(
        "GitHub workflow disablement transport response exceeds the bounded size limit",
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(
        "GitHub workflow disablement transport response exceeds the bounded size limit",
      );
    }

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("GitHub workflow disablement transport response contains invalid UTF-8");
    }

    let duplicateKeys;
    try {
      duplicateKeys = hasDuplicateJsonObjectKeys(text);
    } catch {
      throw new Error("GitHub workflow disablement transport returned invalid JSON");
    }
    if (duplicateKeys) {
      throw new Error(
        "GitHub workflow disablement transport response contains duplicate decoded JSON keys",
      );
    }
    return JSON.parse(text);
  }

  /**
   * Re-read the exact protected `main` commit through GitHub REST.
   *
   * @param {object} input repository-bound request input
   * @returns {Promise<object>} immutable object containing the validated SHA
   */
  async function revalidateDefaultBranch({ repository }) {
    requireRepository(repository);
    const response = await request("/branches/main", "GET", 200);
    const body = await parseResponseJson(response);
    const sha = body?.commit?.sha;
    if (!LOWERCASE_SHA_40.test(sha ?? "")) {
      throw new Error(
        "GitHub workflow disablement transport returned invalid protected-main identity",
      );
    }
    return Object.freeze({ sha });
  }

  /**
   * Re-read one workflow record and retain only its exact validated identity.
   *
   * @param {object} input repository and numeric workflow identity
   * @returns {Promise<object>} immutable workflow ID, canonical path, and state
   */
  async function revalidateWorkflow({ repository, workflowId }) {
    requireRepository(repository);
    requireWorkflowId(workflowId);
    const response = await request(`/actions/workflows/${workflowId}`, "GET", 200);
    const body = await parseResponseJson(response);
    if (body?.id !== workflowId) {
      throw new Error("GitHub workflow disablement transport returned invalid workflow identity");
    }
    if (!validWorkflowPath(body?.path)) {
      throw new Error("GitHub workflow disablement transport returned invalid workflow identity");
    }
    if (typeof body?.state !== "string") {
      throw new Error("GitHub workflow disablement transport returned invalid workflow identity");
    }
    return Object.freeze({
      id: body.id,
      path: body.path,
      state: body.state,
    });
  }

  /**
   * Send the single privileged workflow-disable request for an exact workflow ID.
   *
   * @param {object} input repository and numeric workflow identity
   * @returns {Promise<void>} resolves only on GitHub's exact HTTP 204 response
   */
  async function disableWorkflow({ repository, workflowId }) {
    requireRepository(repository);
    requireWorkflowId(workflowId);
    await request(`/actions/workflows/${workflowId}/disable`, "PUT", 204);
  }

  return Object.freeze({
    revalidateDefaultBranch,
    revalidateWorkflow,
    disableWorkflow,
  });
}

/**
 * Build a fail-closed disablement plan from one exact workflow-registry audit and
 * an immediately refreshed live registry snapshot. Active-orphan findings are the
 * only audit failures that can authorize a plan; every other failure invalidates it.
 * Passing plans are immutable, process-local authorities: serialized or reconstructed
 * lookalikes remain review evidence but cannot authorize mutation.
 *
 * @param {object} input exact audit, expected protected-main identity, and live registry
 * @returns {object} bounded plan containing only exact active-orphan identities
 */
export function buildWorkflowDisablementPlan(input) {
  const audit = input?.audit;
  const repository = input?.expectedRepository;
  const defaultBranchSha = input?.expectedDefaultBranchSha;
  const liveWorkflows = Array.isArray(input?.liveWorkflows) ? input.liveWorkflows : [];

  if (repository !== EXPECTED_REPOSITORY || audit?.repository_full_name !== repository) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "repository_identity_invalid",
      `Workflow disablement evidence must be bound to exact repository ${EXPECTED_REPOSITORY}.`,
    );
  }

  if (
    !LOWERCASE_SHA_40.test(defaultBranchSha ?? "")
    || audit?.default_branch_sha !== defaultBranchSha
  ) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "default_branch_identity_changed",
      "Workflow disablement evidence is not bound to the exact protected-main commit.",
    );
  }

  if (
    !Array.isArray(audit?.failures)
    || !Array.isArray(audit?.workflows)
    || !Array.isArray(input?.liveWorkflows)
  ) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "disablement_evidence_invalid",
      "Workflow disablement planning requires complete audit failures, workflow records, and live registry records.",
    );
  }

  if (
    audit.schema_version !== 1
    || audit.status !== "FAIL"
    || !validObservedAt(audit.observed_at)
    || !validPaginationReceipts(audit.pagination_receipts)
  ) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "disablement_audit_not_authoritative",
      "Workflow disablement requires a complete schema-v1 failing registry audit with canonical observation and pagination evidence.",
    );
  }

  if (
    audit.failures.length === 0
    || audit.failures.some(
      (failure) => !isRecord(failure)
        || failure.code !== "active_orphan_workflow"
        || !validWorkflowId(failure.workflow_id),
    )
  ) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "disablement_audit_not_authoritative",
      "Workflow disablement is blocked unless the registry audit contains one or more exact active-orphan failures and no other failure type.",
    );
  }

  const candidates = audit.workflows.filter(
    (workflow) => isRecord(workflow) && workflow.classification === "active_orphan",
  );
  const candidateIds = candidates.map((workflow) => workflow.workflow_id).sort((left, right) => left - right);
  const failureIds = audit.failures.map((failure) => failure.workflow_id).sort((left, right) => left - right);
  if (
    candidates.length === 0
    || new Set(candidateIds).size !== candidateIds.length
    || new Set(failureIds).size !== failureIds.length
    || JSON.stringify(candidateIds) !== JSON.stringify(failureIds)
  ) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "active_orphan_evidence_inconsistent",
      "Every active-orphan workflow must have exactly one matching active-orphan audit failure and vice versa.",
    );
  }

  const liveIds = liveWorkflows.map((workflow) => workflow?.id);
  if (new Set(liveIds).size !== liveIds.length) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "workflow_identity_changed",
      "The live workflow registry contains a duplicate workflow ID.",
    );
  }
  const livePaths = liveWorkflows.map((workflow) => workflow?.path);
  if (new Set(livePaths).size !== livePaths.length) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "workflow_identity_changed",
      "The live workflow registry contains a reused workflow path.",
    );
  }

  const disablements = [];
  for (const candidate of candidates) {
    if (
      !validWorkflowId(candidate.workflow_id)
      || !validWorkflowPath(candidate.workflow_path)
      || candidate.workflow_state !== "active"
    ) {
      return failedPlan(
        repository,
        defaultBranchSha,
        "workflow_identity_changed",
        "An audited active-orphan workflow does not have a safe canonical identity.",
      );
    }

    const live = liveWorkflows.find(
      (workflow) => workflow?.id === candidate.workflow_id
        && workflow?.path === candidate.workflow_path,
    );
    if (!live || live.state !== "active") {
      return failedPlan(
        repository,
        defaultBranchSha,
        "workflow_identity_changed",
        "An audited active-orphan workflow no longer has the exact active live registry identity.",
      );
    }

    disablements.push({
      workflow_id: candidate.workflow_id,
      workflow_path: candidate.workflow_path,
      expected_state: "active",
    });
  }

  disablements.sort((left, right) => left.workflow_id - right.workflow_id);
  return freezePlan({
    status: "PASS",
    repository_full_name: repository,
    default_branch_sha: defaultBranchSha,
    disablements,
    failures: [],
  }, true);
}

/**
 * Disable exactly one candidate from a freshly built process-local plan after
 * revalidating the protected-main SHA plus the live workflow ID, path, and state.
 * The exact workflow must then be observed in GitHub's `disabled_manually` state
 * before this function returns. Callers supply the authorized mutation primitive;
 * this module never owns credentials, transport, or batch authority.
 *
 * @param {object} input authentic plan, protected-main/workflow readers, and disable callback
 * @returns {Promise<object>} immutable description of the observed completed mutation
 */
export async function executeWorkflowDisablement(input) {
  const plan = input?.plan;
  const candidate = input?.candidate;
  if (plan?.status !== "PASS" || !Array.isArray(plan?.disablements)) {
    throw new Error("candidate is not part of the exact disablement plan");
  }
  if (!validPlanAuthority(plan)) {
    throw new Error("disablement plan authority is invalid");
  }
  if (
    typeof input?.revalidateDefaultBranch !== "function"
    || typeof input?.revalidateWorkflow !== "function"
    || typeof input?.disableWorkflow !== "function"
  ) {
    throw new Error("disablement executor is invalid");
  }
  if (candidate?.expected_state !== "active") {
    throw new Error("candidate is not part of the exact disablement plan");
  }

  const planned = plan.disablements.find(
    (item) => item.workflow_id === candidate.workflow_id
      && item.workflow_path === candidate.workflow_path
      && item.expected_state === "active",
  );

  if (!planned) {
    throw new Error("candidate is not part of the exact disablement plan");
  }

  const protectedMain = await input.revalidateDefaultBranch({
    repository: plan.repository_full_name,
  });
  if (protectedMain?.sha !== plan.default_branch_sha) {
    throw new Error("protected main changed before disablement");
  }

  const live = await input.revalidateWorkflow({
    repository: plan.repository_full_name,
    workflowId: planned.workflow_id,
  });
  if (
    live?.id !== planned.workflow_id
    || live?.path !== planned.workflow_path
    || live?.state !== "active"
  ) {
    throw new Error("workflow identity changed before disablement");
  }

  await input.disableWorkflow({
    repository: plan.repository_full_name,
    workflowId: planned.workflow_id,
  });

  const disabled = await input.revalidateWorkflow({
    repository: plan.repository_full_name,
    workflowId: planned.workflow_id,
  });
  if (
    disabled?.id !== planned.workflow_id
    || disabled?.path !== planned.workflow_path
    || disabled?.state !== "disabled_manually"
  ) {
    throw new Error("workflow disablement postcondition not observed");
  }

  return Object.freeze({
    repository_full_name: plan.repository_full_name,
    workflow_id: planned.workflow_id,
    workflow_path: planned.workflow_path,
    prior_state: "active",
    final_state: "disabled_manually",
    mutation: "disable",
  });
}
