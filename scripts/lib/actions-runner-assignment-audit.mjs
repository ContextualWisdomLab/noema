export const DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS = 5 * 60 * 1000;

/**
 * Evaluate bounded GitHub Actions runner-assignment evidence.
 *
 * This initial seam deliberately validates only the outer evidence shape. The
 * test-first follow-up defines how queued, assigned, stale, and mismatched runs
 * must be classified without conflating runner assignment with job success.
 *
 * @param {unknown} evidence Untrusted workflow-run and job evidence.
 * @returns {{status: "PASS" | "PENDING" | "FAIL", checks: object[], failures: object[]}}
 *   A deterministic runner-assignment decision that never authorizes merge.
 */
export function evaluateRunnerAssignmentEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || !Array.isArray(evidence.runs)) {
    return {
      status: "FAIL",
      checks: [],
      failures: [
        {
          code: "runner_evidence_invalid",
          detail: "Runner-assignment evidence must contain a runs array.",
        },
      ],
    };
  }

  return {
    status: "PASS",
    checks: [],
    failures: [],
  };
}
