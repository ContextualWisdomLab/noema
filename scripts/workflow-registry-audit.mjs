const REPOSITORY_WORKFLOW_PREFIX = ".github/workflows/";
const LOWERCASE_SHA_40 = /^[0-9a-f]{40}$/;
const PERCENT_ENCODING = /%[0-9a-f]{2}/i;

/**
 * Build the least-authority environment for read-only GitHub CLI collection.
 * Only the explicit delegated token and executable path may cross from the parent.
 *
 * @param {Record<string, string | undefined>} parentEnvironment parent process environment
 * @returns {Record<string, string>} reviewed GitHub CLI child environment
 */
export function createGhSubprocessEnvironment(parentEnvironment = {}) {
  const child = {
    GH_HOST: "github.com",
    NO_COLOR: "1",
  };

  if (typeof parentEnvironment.PATH === "string" && parentEnvironment.PATH.length > 0) {
    child.PATH = parentEnvironment.PATH;
  }
  if (
    typeof parentEnvironment.GH_TOKEN === "string" &&
    parentEnvironment.GH_TOKEN.length > 0
  ) {
    child.GH_TOKEN = parentEnvironment.GH_TOKEN;
  }

  return child;
}

function paginationFailure(pagination) {
  const totalCount = pagination?.totalCount;
  const receipts = pagination?.receipts;
  if (!Number.isSafeInteger(totalCount) || totalCount < 0 || !Array.isArray(receipts)) {
    return {
      code: "workflow_pagination_invalid",
      detail: "Workflow registry pagination evidence must contain a non-negative safe total and page receipts.",
    };
  }

  const retainedCount = receipts.reduce((sum, receipt) => {
    if (!Number.isSafeInteger(receipt?.itemCount) || receipt.itemCount < 0) {
      return Number.NaN;
    }
    return sum + receipt.itemCount;
  }, 0);

  if (!Number.isSafeInteger(retainedCount)) {
    return {
      code: "workflow_pagination_invalid",
      detail: "Workflow registry pagination receipts contain an invalid item count.",
    };
  }

  if (retainedCount !== totalCount) {
    return {
      code: "workflow_pagination_incomplete",
      detail: `Workflow registry pagination retained ${retainedCount} of ${totalCount} advertised records.`,
    };
  }

  if (receipts.some((receipt, index) => receipt.page !== index + 1)) {
    return {
      code: "workflow_pagination_invalid",
      detail: "Workflow registry pagination receipts must be contiguous from page 1.",
    };
  }

  if (receipts.length > 0 && receipts.at(-1)?.hasNext === true) {
    return {
      code: "workflow_pagination_incomplete",
      detail: `Workflow registry pagination retained ${retainedCount} of at least ${retainedCount + 1} records while the last page still advertised a successor.`,
    };
  }

  return null;
}

function classifyRecord(record, trackedWorkflowPaths, activePullRequestWorkflowPaths) {
  const path = record?.path;
  if (!Number.isSafeInteger(record?.id) || record.id <= 0 || typeof path !== "string") {
    return {
      workflow_id: Number.isSafeInteger(record?.id) ? record.id : null,
      workflow_path: typeof path === "string" ? path : null,
      workflow_state: typeof record?.state === "string" ? record.state : null,
      classification: "unresolved_registry_record",
      failure: {
        code: "workflow_record_invalid",
        workflow_id: Number.isSafeInteger(record?.id) ? record.id : null,
        detail: "Workflow registry records require a positive integer id and string path.",
      },
    };
  }

  const base = {
    workflow_id: record.id,
    workflow_path: path,
    workflow_state: typeof record.state === "string" ? record.state : "unknown",
  };

  if (!path.startsWith(REPOSITORY_WORKFLOW_PREFIX)) {
    return { ...base, classification: "external_or_dynamic_record", failure: null };
  }

  if (PERCENT_ENCODING.test(path)) {
    return {
      ...base,
      classification: "unresolved_registry_record",
      failure: {
        code: "workflow_path_encoding_ambiguous",
        workflow_id: record.id,
        detail: `Workflow path ${path} contains percent-encoded bytes and cannot be matched safely.`,
      },
    };
  }

  if (trackedWorkflowPaths.has(path)) {
    return { ...base, classification: "present_on_default_branch", failure: null };
  }

  const lowerPath = path.toLowerCase();
  const trackedCaseCollision = [...trackedWorkflowPaths].find(
    (trackedPath) => trackedPath.toLowerCase() === lowerPath,
  );
  if (trackedCaseCollision) {
    return {
      ...base,
      classification: "unresolved_registry_record",
      failure: {
        code: "workflow_path_case_mismatch",
        workflow_id: record.id,
        detail: `Workflow path ${path} differs by case from protected-tree path ${trackedCaseCollision}.`,
      },
    };
  }

  if (activePullRequestWorkflowPaths.has(path)) {
    return { ...base, classification: "active_pr_owned", failure: null };
  }

  if (record.state === "disabled_manually" || record.state === "disabled_inactivity") {
    return { ...base, classification: "disabled_registry_record", failure: null };
  }

  if (record.state === "active") {
    return {
      ...base,
      classification: "active_orphan",
      failure: {
        code: "active_orphan_workflow",
        workflow_id: record.id,
        detail: `Active workflow ${path} is absent from the exact protected-main workflow tree.`,
      },
    };
  }

  return {
    ...base,
    classification: "unresolved_registry_record",
    failure: {
      code: "workflow_state_unresolved",
      workflow_id: record.id,
      detail: `Workflow ${path} has unsupported registry state ${String(record.state)}.`,
    },
  };
}

/**
 * Compare the complete GitHub Actions registry with one exact protected-main workflow tree.
 * This evaluator is deliberately read-only: active orphan records are findings, never mutation authority.
 *
 * @param {object} input audit inputs
 * @returns {object} bounded machine-readable audit result
 */
export function classifyWorkflowRegistry(input) {
  const failures = [];
  const trackedWorkflowPaths = new Set(input?.trackedWorkflowPaths ?? []);
  const activePullRequestWorkflowPaths = new Set(
    input?.activePullRequestWorkflowPaths ?? [],
  );
  const workflows = Array.isArray(input?.workflows) ? input.workflows : [];

  if (!LOWERCASE_SHA_40.test(input?.defaultBranchSha ?? "")) {
    failures.push({
      code: "default_branch_sha_invalid",
      detail: "Default-branch identity must be an exact lowercase 40-hex commit SHA.",
    });
  }

  if (!Array.isArray(input?.workflows)) {
    failures.push({
      code: "workflow_registry_invalid",
      detail: "Workflow registry evidence must be supplied as an array.",
    });
  }

  const paginationProblem = paginationFailure(input?.pagination);
  if (paginationProblem) {
    failures.push(paginationProblem);
  }

  const firstPathById = new Map();
  for (const record of workflows) {
    if (!Number.isSafeInteger(record?.id) || typeof record?.path !== "string") {
      continue;
    }
    const firstPath = firstPathById.get(record.id);
    if (firstPath !== undefined && firstPath !== record.path) {
      failures.push({
        code: "workflow_id_reused",
        workflow_id: record.id,
        detail: `Workflow id ${record.id} is associated with conflicting paths ${firstPath} and ${record.path}.`,
      });
    } else {
      firstPathById.set(record.id, record.path);
    }
  }

  const classified = workflows.map((record) =>
    classifyRecord(record, trackedWorkflowPaths, activePullRequestWorkflowPaths),
  );
  for (const record of classified) {
    if (record.failure) {
      failures.push(record.failure);
    }
  }

  return {
    schema_version: 1,
    repository_full_name: input?.repository ?? null,
    default_branch_sha: input?.defaultBranchSha ?? null,
    observed_at: input?.observedAt ?? null,
    pagination_receipts: input?.pagination?.receipts ?? [],
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    workflows: classified.map(({ failure: _failure, ...record }) => record),
  };
}
