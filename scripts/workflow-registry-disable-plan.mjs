const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const LOWERCASE_SHA_40 = /^[0-9a-f]{40}$/;

function failedPlan(repository, defaultBranchSha, code, detail) {
  return {
    status: "FAIL",
    repository_full_name: repository ?? null,
    default_branch_sha: defaultBranchSha ?? null,
    disablements: [],
    failures: [{ code, detail }],
  };
}

/**
 * Build a fail-closed disablement plan from one exact workflow-registry audit and
 * an immediately refreshed live registry snapshot. Active-orphan findings are the
 * only audit failures that can authorize a plan; every other failure invalidates it.
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
    !LOWERCASE_SHA_40.test(defaultBranchSha ?? "") ||
    audit?.default_branch_sha !== defaultBranchSha
  ) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "default_branch_identity_changed",
      "Workflow disablement evidence is not bound to the exact protected-main commit.",
    );
  }

  if (
    !Array.isArray(audit?.failures) ||
    !Array.isArray(audit?.workflows) ||
    !Array.isArray(input?.liveWorkflows)
  ) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "disablement_evidence_invalid",
      "Workflow disablement planning requires complete audit failures, workflow records, and live registry records.",
    );
  }

  if (audit.failures.some((failure) => failure?.code !== "active_orphan_workflow")) {
    return failedPlan(
      repository,
      defaultBranchSha,
      "disablement_audit_not_authoritative",
      "Workflow disablement is blocked while the registry audit contains a non-orphan failure.",
    );
  }

  const candidates = audit.workflows.filter(
    (workflow) => workflow?.classification === "active_orphan",
  );
  const candidateIds = candidates.map((workflow) => workflow?.workflow_id).sort();
  const failureIds = audit.failures.map((failure) => failure?.workflow_id).sort();
  if (JSON.stringify(candidateIds) !== JSON.stringify(failureIds)) {
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
      !Number.isSafeInteger(candidate?.workflow_id) ||
      candidate.workflow_id <= 0 ||
      typeof candidate?.workflow_path !== "string" ||
      !candidate.workflow_path.startsWith(".github/workflows/") ||
      candidate.workflow_state !== "active"
    ) {
      return failedPlan(
        repository,
        defaultBranchSha,
        "workflow_identity_changed",
        "An audited active-orphan workflow does not have a safe exact identity.",
      );
    }

    const live = liveWorkflows.find(
      (workflow) =>
        workflow?.id === candidate.workflow_id && workflow?.path === candidate.workflow_path,
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
  return {
    status: "PASS",
    repository_full_name: repository,
    default_branch_sha: defaultBranchSha,
    disablements,
    failures: [],
  };
}

/**
 * Disable exactly one candidate after revalidating its live workflow ID, path, and
 * state. Callers supply the authorized mutation primitive; this module never owns
 * credentials, transport, or batch mutation authority.
 *
 * @param {object} input passing plan, candidate, live reader, and disable callback
 * @returns {Promise<object>} immutable description of the single completed mutation
 */
export async function executeWorkflowDisablement(input) {
  const plan = input?.plan;
  const candidate = input?.candidate;
  if (candidate?.expected_state !== "active") {
    throw new Error("candidate is not part of the exact disablement plan");
  }

  const planned = Array.isArray(plan?.disablements)
    ? plan.disablements.find(
        (item) =>
          item.workflow_id === candidate.workflow_id &&
          item.workflow_path === candidate.workflow_path &&
          item.expected_state === "active",
      )
    : undefined;

  if (plan?.status !== "PASS" || !planned) {
    throw new Error("candidate is not part of the exact disablement plan");
  }

  const live = await input.revalidateWorkflow({
    repository: plan.repository_full_name,
    workflowId: planned.workflow_id,
  });
  if (
    live?.id !== planned.workflow_id ||
    live?.path !== planned.workflow_path ||
    live?.state !== "active"
  ) {
    throw new Error("workflow identity changed before disablement");
  }

  await input.disableWorkflow({
    repository: plan.repository_full_name,
    workflowId: planned.workflow_id,
  });

  return {
    repository_full_name: plan.repository_full_name,
    workflow_id: planned.workflow_id,
    workflow_path: planned.workflow_path,
    prior_state: "active",
    mutation: "disable",
  };
}
