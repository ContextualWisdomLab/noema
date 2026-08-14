const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const WORKFLOW_PATH_PREFIX = ".github/workflows/";
const LOWERCASE_SHA_40 = /^[0-9a-f]{40}$/;
const ISO_UTC_MILLISECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const AUTHENTIC_PLANS = new WeakSet();

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

function failedPlan(repository, defaultBranchSha, code, detail) {
  return freezePlan({
    status: "FAIL",
    repository_full_name: repository ?? null,
    default_branch_sha: defaultBranchSha ?? null,
    disablements: [],
    failures: [{ code, detail }],
  });
}

function validWorkflowId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

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
    pathSegments.length > 0
    && pathSegments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function validObservedAt(value) {
  return (
    typeof value === "string"
    && ISO_UTC_MILLISECOND.test(value)
    && !Number.isNaN(Date.parse(value))
  );
}

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

function validPlanAuthority(plan) {
  return isRecord(plan) && AUTHENTIC_PLANS.has(plan);
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
 * revalidating its live workflow ID, path, and state. Callers supply the authorized
 * mutation primitive; this module never owns credentials, transport, or batch authority.
 *
 * @param {object} input authentic plan, candidate, live reader, and disable callback
 * @returns {Promise<object>} immutable description of the single completed mutation
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
    typeof input?.revalidateWorkflow !== "function"
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

  return Object.freeze({
    repository_full_name: plan.repository_full_name,
    workflow_id: planned.workflow_id,
    workflow_path: planned.workflow_path,
    prior_state: "active",
    mutation: "disable",
  });
}
