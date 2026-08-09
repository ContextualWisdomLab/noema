const MAX_SELECTED_RUNS = 20;

/** Parse a bounded comma-separated GitHub Actions run-id selection. */
export function parseSelectedRunIds(_value) {
  return [];
}

/** Flatten paginated GitHub Actions job pages without trusting page shape. */
export function flattenJobPages(_pages) {
  return [];
}

/**
 * Collect exact-head workflow-run/job evidence through injected read-only adapters.
 *
 * @param {object} input Source identity and read adapters.
 * @returns {Promise<object>} Evidence ready for deterministic assignment evaluation.
 */
export async function collectRunnerAssignmentEvidence(input) {
  return {
    expected_head_sha: input.expected_head_sha,
    observed_at: input.observed_at,
    queue_grace_milliseconds: input.queue_grace_milliseconds,
    runs: [],
  };
}

export { MAX_SELECTED_RUNS };
