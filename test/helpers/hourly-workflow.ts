const candidateModelPattern = /^    nvidia-nim\/.+$/gm;
const fallbackStepName = "- name: Run bounded NVIDIA NIM model fallback";

/** Seconds reserved for setup work and the stable terminal diagnostic. */
export const SETUP_AND_DIAGNOSTIC_RESERVE_SECONDS = 300;

/** Parsed candidate and cleanup budgets from the production workflow. */
export interface CandidateBudget {
  candidateCount: number;
  candidateSeconds: number;
  candidateGraceSeconds: number;
  reinstallSeconds: number;
  reinstallGraceSeconds: number;
  interCandidateCleanupCount: number;
  jobSeconds: number;
  totalSeconds: number;
}

/** Ordered offsets for the production final-candidate cleanup control flow. */
export interface CandidateControlFlow {
  candidateListIndex: number;
  candidateLoopIndex: number;
  finalCandidateGuardIndex: number;
  resetIndex: number;
  reinstallIndex: number;
}

/**
 * Return one complete job block from the workflow text.
 *
 * @param workflow Complete workflow YAML.
 * @param jobName Job whose two-space-indented declaration starts the slice.
 * @param nextJobName Optional following job that terminates the slice.
 * @returns Exact job block, excluding the following job declaration.
 * @throws {Error} When either requested boundary is absent or out of order.
 */
export function readJobSlice(
  workflow: string,
  jobName: string,
  nextJobName?: string,
): string {
  const start = workflow.indexOf(`  ${jobName}:`);
  if (start < 0) {
    throw new Error(`Workflow job '${jobName}' is missing.`);
  }

  if (nextJobName === undefined) {
    return workflow.slice(start);
  }

  const end = workflow.indexOf(`  ${nextJobName}:`, start + 1);
  if (end <= start) {
    throw new Error(
      `Workflow job '${nextJobName}' is missing after '${jobName}'.`,
    );
  }
  return workflow.slice(start, end);
}

/**
 * Parse one required positive integer capture from workflow text.
 *
 * @param text Workflow fragment to inspect.
 * @param pattern Pattern whose first capture is the decimal value.
 * @param label Human-readable contract name for diagnostics.
 * @returns Parsed positive safe integer.
 * @throws {Error} When the contract is absent or not a positive safe integer.
 */
function readPositiveCapture(
  text: string,
  pattern: RegExp,
  label: string,
): number {
  const match = text.match(pattern);
  if (match === null) {
    throw new Error(`Workflow ${label} is missing.`);
  }
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Workflow ${label} is not a positive safe integer.`);
  }
  return value;
}

/**
 * Read the configured candidate, cleanup, and proposer-job budgets.
 *
 * @param workflow Complete workflow YAML.
 * @returns Parsed budget values and their enforced worst-case total.
 */
export function readCandidateBudget(workflow: string): CandidateBudget {
  const proposer = readJobSlice(
    workflow,
    "propose_product_increment",
    "package_product_increment",
  );
  const candidateSeconds = readPositiveCapture(
    workflow,
    /OPENCODE_RUN_TIMEOUT_SECONDS: "(\d+)"/,
    "candidate timeout",
  );
  const candidateGraceSeconds = readPositiveCapture(
    workflow,
    /OPENCODE_KILL_GRACE_SECONDS: "(\d+)"/,
    "candidate kill grace",
  );
  const reinstallSeconds = readPositiveCapture(
    workflow,
    /DEPENDENCY_REINSTALL_TIMEOUT_SECONDS: "(\d+)"/,
    "dependency reinstall timeout",
  );
  const reinstallGraceSeconds = readPositiveCapture(
    workflow,
    /DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS: "(\d+)"/,
    "dependency reinstall kill grace",
  );
  const jobMinutes = readPositiveCapture(
    proposer,
    /timeout-minutes: (\d+)/,
    "proposal-job timeout",
  );
  const candidateCount = workflow.match(candidateModelPattern)?.length ?? 0;
  const interCandidateCleanupCount = Math.max(candidateCount - 1, 0);
  const jobSeconds = jobMinutes * 60;
  const totalSeconds = candidateCount * (
    candidateSeconds + candidateGraceSeconds
  ) + interCandidateCleanupCount * (
    reinstallSeconds + reinstallGraceSeconds
  ) + SETUP_AND_DIAGNOSTIC_RESERVE_SECONDS;

  return {
    candidateCount,
    candidateSeconds,
    candidateGraceSeconds,
    reinstallSeconds,
    reinstallGraceSeconds,
    interCandidateCleanupCount,
    jobSeconds,
    totalSeconds,
  };
}

/**
 * Validate and return the ordered final-candidate cleanup control flow.
 *
 * @param workflow Complete workflow YAML.
 * @returns Ordered offsets within the fallback step.
 * @throws {Error} When a required anchor is absent or cleanup can precede the
 * final-candidate guard.
 */
export function readCandidateControlFlow(
  workflow: string,
): CandidateControlFlow {
  const proposer = readJobSlice(
    workflow,
    "propose_product_increment",
    "package_product_increment",
  );
  const fallbackStart = proposer.indexOf(fallbackStepName);
  if (fallbackStart < 0) {
    throw new Error("Workflow bounded fallback step is missing.");
  }
  const fallback = proposer.slice(fallbackStart);
  const anchors = {
    candidateListIndex: fallback.indexOf(
      'read -r -a model_candidates <<<"$OPENCODE_MODEL_CANDIDATES"',
    ),
    candidateLoopIndex: fallback.indexOf(
      "for ((candidate_index = 0; candidate_index < candidate_count; candidate_index++)); do",
    ),
    finalCandidateGuardIndex: fallback.indexOf(
      'if [ "$candidate_index" -eq $((candidate_count - 1)) ]; then',
    ),
    resetIndex: fallback.indexOf(
      'git -C "$GITHUB_WORKSPACE" reset --hard HEAD',
    ),
    reinstallIndex: fallback.indexOf(
      'timeout --kill-after="${DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS}s" "${DEPENDENCY_REINSTALL_TIMEOUT_SECONDS}s" npm ci --ignore-scripts',
    ),
  };

  for (const [label, index] of Object.entries(anchors)) {
    if (index < 0) {
      throw new Error(`Workflow fallback anchor '${label}' is missing.`);
    }
  }

  if (!(
    anchors.candidateListIndex < anchors.candidateLoopIndex
    && anchors.candidateLoopIndex < anchors.finalCandidateGuardIndex
    && anchors.finalCandidateGuardIndex < anchors.resetIndex
    && anchors.resetIndex < anchors.reinstallIndex
  )) {
    throw new Error(
      "Workflow final-candidate guard must precede inter-candidate cleanup.",
    );
  }

  return anchors;
}
