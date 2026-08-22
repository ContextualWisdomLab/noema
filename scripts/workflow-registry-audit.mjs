const REPOSITORY_WORKFLOW_PREFIX = ".github/workflows/";
const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const LOWERCASE_SHA_40 = /^[0-9a-f]{40}$/;
const ISO_UTC_MILLISECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PERCENT_ENCODING = /%[0-9a-f]{2}/i;
const MAX_DIAGNOSTIC_DETAIL_LENGTH = 2048;
const REDACTED = "[REDACTED]";

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

/**
 * Validate a workflow-path inventory before it can influence orphan classification.
 *
 * @param {unknown} value candidate workflow-path inventory
 * @param {string} code failure code identifying the untrusted inventory source
 * @param {string} label beginner-readable inventory label for diagnostics
 * @returns {{code: string, detail: string} | null} validation failure or null
 */
function workflowPathInventoryFailure(value, code, label) {
  if (!Array.isArray(value)) {
    return {
      code,
      detail: `${label} must be an array of repository workflow paths.`,
    };
  }

  for (const path of value) {
    if (typeof path !== "string") {
      return {
        code,
        detail: `${label} must contain workflow paths as strings.`,
      };
    }
    if (!path.startsWith(REPOSITORY_WORKFLOW_PREFIX)) {
      return {
        code,
        detail: `${label} contains non-workflow path ${path}.`,
      };
    }
  }

  return null;
}

/**
 * Validate the canonical, non-future UTC timestamp required by registry evidence.
 *
 * @param {unknown} value proposed observation timestamp
 * @returns {boolean} true only for a real canonical timestamp no later than now
 */
function validObservedAt(value) {
  if (typeof value !== "string") return false;
  if (!ISO_UTC_MILLISECOND.test(value)) return false;

  const observedAtMs = Date.parse(value);
  if (new Date(observedAtMs).toISOString() !== value) return false;
  if (observedAtMs > Date.now()) return false;
  return true;
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

  if (receipts.some((receipt) => typeof receipt?.hasNext !== "boolean")) {
    return {
      code: "workflow_pagination_invalid",
      detail: "Workflow registry pagination receipts require boolean continuation markers.",
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

function classifyRecord(
  record,
  trackedWorkflowPaths,
  activePullRequestWorkflowPaths,
  workflowPathInventoryTrusted,
) {
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

  if (!workflowPathInventoryTrusted) {
    return {
      ...base,
      classification: "unresolved_registry_record",
      failure: {
        code: "workflow_path_inventory_untrusted",
        workflow_id: record.id,
        detail: `Workflow ${path} cannot be classified as present, active-PR-owned, or orphaned because repository workflow path inventories are invalid.`,
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

  const normalizedPath = path.normalize("NFC").toLowerCase();
  const trackedNormalizationCollision = [...trackedWorkflowPaths].find(
    (trackedPath) =>
      trackedPath !== path &&
      trackedPath.normalize("NFC").toLowerCase() === normalizedPath,
  );
  if (trackedNormalizationCollision) {
    return {
      ...base,
      classification: "unresolved_registry_record",
      failure: {
        code: "workflow_path_normalization_mismatch",
        workflow_id: record.id,
        detail: `Workflow path ${path} differs by Unicode normalization from protected-tree path ${trackedNormalizationCollision}.`,
      },
    };
  }

  if (activePullRequestWorkflowPaths.has(path)) {
    return { ...base, classification: "active_pr_owned", failure: null };
  }

  const activePullRequestCaseCollision = [...activePullRequestWorkflowPaths].find(
    (activePath) => activePath.toLowerCase() === lowerPath,
  );
  if (activePullRequestCaseCollision) {
    return {
      ...base,
      classification: "unresolved_registry_record",
      failure: {
        code: "active_pr_workflow_path_case_mismatch",
        workflow_id: record.id,
        detail: `Workflow path ${path} differs by case from active-PR path ${activePullRequestCaseCollision}.`,
      },
    };
  }

  const activePullRequestNormalizationCollision = [...activePullRequestWorkflowPaths].find(
    (activePath) => activePath.normalize("NFC").toLowerCase() === normalizedPath,
  );
  if (activePullRequestNormalizationCollision) {
    return {
      ...base,
      classification: "unresolved_registry_record",
      failure: {
        code: "active_pr_workflow_path_normalization_mismatch",
        workflow_id: record.id,
        detail: `Workflow path ${path} differs by Unicode normalization from active-PR path ${activePullRequestNormalizationCollision}.`,
      },
    };
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

  if (input?.repository !== EXPECTED_REPOSITORY) {
    failures.push({
      code: "repository_identity_invalid",
      detail: `Workflow registry evidence must be bound to exact repository ${EXPECTED_REPOSITORY}.`,
    });
  }

  const trackedWorkflowPathsProblem = workflowPathInventoryFailure(
    input?.trackedWorkflowPaths,
    "tracked_workflow_paths_invalid",
    "Protected-tree workflow path inventory",
  );
  const activePullRequestWorkflowPathsProblem = workflowPathInventoryFailure(
    input?.activePullRequestWorkflowPaths,
    "active_pr_workflow_paths_invalid",
    "Active-PR workflow path inventory",
  );
  if (trackedWorkflowPathsProblem) {
    failures.push(trackedWorkflowPathsProblem);
  }
  if (activePullRequestWorkflowPathsProblem) {
    failures.push(activePullRequestWorkflowPathsProblem);
  }
  const workflowPathInventoryTrusted =
    trackedWorkflowPathsProblem === null && activePullRequestWorkflowPathsProblem === null;
  const trackedWorkflowPaths = new Set(
    trackedWorkflowPathsProblem === null ? input.trackedWorkflowPaths : [],
  );
  const activePullRequestWorkflowPaths = new Set(
    activePullRequestWorkflowPathsProblem === null
      ? input.activePullRequestWorkflowPaths
      : [],
  );
  const workflows = Array.isArray(input?.workflows) ? input.workflows : [];

  if (!LOWERCASE_SHA_40.test(input?.defaultBranchSha ?? "")) {
    failures.push({
      code: "default_branch_sha_invalid",
      detail: "Default-branch identity must be an exact lowercase 40-hex commit SHA.",
    });
  }

  if (!validObservedAt(input?.observedAt)) {
    failures.push({
      code: "observation_time_invalid",
      detail: "Workflow registry observation time must be a canonical non-future UTC timestamp.",
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
  const firstIdByPath = new Map();
  for (const record of workflows) {
    if (!Number.isSafeInteger(record?.id) || typeof record?.path !== "string") {
      continue;
    }
    const firstPath = firstPathById.get(record.id);
    if (firstPath === record.path) {
      failures.push({
        code: "workflow_record_duplicate",
        workflow_id: record.id,
        detail: `Workflow registry repeated id ${record.id} for path ${record.path}; duplicate records cannot prove a complete registry snapshot.`,
      });
    } else if (firstPath !== undefined) {
      failures.push({
        code: "workflow_id_reused",
        workflow_id: record.id,
        detail: `Workflow id ${record.id} is associated with conflicting paths ${firstPath} and ${record.path}.`,
      });
    } else {
      firstPathById.set(record.id, record.path);
    }

    const firstId = firstIdByPath.get(record.path);
    if (firstId === undefined) {
      firstIdByPath.set(record.path, record.id);
    } else if (firstId !== record.id) {
      failures.push({
        code: "workflow_path_reused",
        workflow_id: record.id,
        detail: `Workflow path ${record.path} is associated with conflicting ids ${firstId} and ${record.id}.`,
      });
    }
  }

  const classified = workflows.map((record) =>
    classifyRecord(
      record,
      trackedWorkflowPaths,
      activePullRequestWorkflowPaths,
      workflowPathInventoryTrusted,
    ),
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

function sanitizeDiagnosticDetail(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/(https?:\/\/)[^/\s@]+@/gi, `$1${REDACTED}@`)
    .replace(
      /([?&](?:access_token|auth_token|token|authorization)=)[^&#\s]*/gi,
      `$1${REDACTED}`,
    )
    .replace(/\bbearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b((?:GH|GITHUB|ACCESS|AUTH|ID|REFRESH)?_?TOKEN)\s*=\s*[^\s,;]+/gi,
      `$1=${REDACTED}`,
    )
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, REDACTED)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, REDACTED)
    .slice(0, MAX_DIAGNOSTIC_DETAIL_LENGTH);
}

function collectionFailure({ repository, observedAt, defaultBranchSha, error }) {
  return {
    schema_version: 1,
    repository_full_name: repository,
    default_branch_sha: defaultBranchSha,
    observed_at: observedAt,
    pagination_receipts: [],
    status: "FAIL",
    failures: [
      {
        code: "workflow_registry_collection_failed",
        http_status: Number.isSafeInteger(error?.status) ? error.status : null,
        detail: sanitizeDiagnosticDetail(error),
      },
    ],
    workflows: [],
  };
}

/**
 * Collect a read-only workflow-registry snapshot through injected GitHub API readers.
 * The default branch is resolved both before and after collection. Movement invalidates
 * the observation instead of allowing an orphan decision against mixed repository state.
 *
 * @param {object} input collector dependencies and repository identity
 * @returns {Promise<object>} exact-branch-bound audit result
 */
export async function collectWorkflowRegistryAudit(input) {
  const observedAt = input.now();
  if (input.repository !== EXPECTED_REPOSITORY) {
    return {
      schema_version: 1,
      repository_full_name: input.repository ?? null,
      default_branch_sha: null,
      observed_at: observedAt,
      pagination_receipts: [],
      status: "FAIL",
      failures: [
        {
          code: "repository_identity_invalid",
          detail: `Workflow registry evidence must be bound to exact repository ${EXPECTED_REPOSITORY}.`,
        },
      ],
      workflows: [],
    };
  }

  let initialBranch;
  let workflowPages;
  let activePullRequestWorkflowPaths;
  let finalBranch;

  try {
    initialBranch = await input.resolveDefaultBranch();
    workflowPages = [];
    const perPage = 100;
    let maxPages = Number.POSITIVE_INFINITY;
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await input.listWorkflowPage({
        repository: input.repository,
        page,
        perPage,
      });
      if (
        !response ||
        !Number.isSafeInteger(response.totalCount) ||
        response.totalCount < 0 ||
        !Array.isArray(response.workflows) ||
        typeof response.hasNext !== "boolean"
      ) {
        throw new Error(`Workflow registry page ${page} returned an invalid envelope.`);
      }
      if (page === 1) {
        // `perPage` is a request ceiling, not proof that every non-final page is full.
        // Bound retries by the advertised record count so partial pages stay valid
        // while a reader that never terminates still cannot loop indefinitely.
        maxPages = Math.max(1, response.totalCount);
      }
      workflowPages.push(response);
      if (!response.hasNext) {
        break;
      }
      if (page === maxPages) {
        throw new Error(
          `Workflow registry pagination exceeded the ${maxPages} pages advertised by totalCount ${response.totalCount}.`,
        );
      }
    }
    activePullRequestWorkflowPaths =
      await input.listActivePullRequestWorkflowPaths();
    finalBranch = await input.resolveDefaultBranch();
  } catch (error) {
    return collectionFailure({
      repository: input.repository,
      observedAt,
      defaultBranchSha: initialBranch?.sha ?? null,
      error,
    });
  }

  const advertisedTotals = new Set(workflowPages.map((page) => page.totalCount));
  const workflows = workflowPages.flatMap((page) => page.workflows);
  const pagination = {
    totalCount: advertisedTotals.size === 1 ? workflowPages[0].totalCount : -1,
    receipts: workflowPages.map((page, index) => ({
      page: index + 1,
      itemCount: page.workflows.length,
      hasNext: page.hasNext,
    })),
  };

  const result = classifyWorkflowRegistry({
    repository: input.repository,
    defaultBranchSha: initialBranch.sha,
    observedAt,
    workflows,
    trackedWorkflowPaths: initialBranch.workflowPaths,
    activePullRequestWorkflowPaths,
    pagination,
  });

  if (finalBranch.sha !== initialBranch.sha) {
    result.status = "FAIL";
    result.failures.unshift({
      code: "default_branch_moved",
      detail: `Protected default branch moved from ${initialBranch.sha} to ${finalBranch.sha} during workflow-registry collection.`,
    });
  }

  return result;
}
