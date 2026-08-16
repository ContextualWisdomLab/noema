/** Seconds reserved for setup work and the stable terminal diagnostic. */
export const SETUP_AND_DIAGNOSTIC_RESERVE_SECONDS = 300;

const singleRunStepName = "- name: Run one contextual-orchestrator OpenCode session";

/** Parsed single-run and proposer-job budgets from the production workflow. */
export interface SingleRunBudget {
  runSeconds: number;
  killGraceSeconds: number;
  jobSeconds: number;
  totalSeconds: number;
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
 * Read the configured single-run and proposer-job budgets.
 *
 * Sequential model-candidate failover is forbidden, so the budget is one
 * gateway-backed OpenCode session plus setup/diagnostic reserve.
 *
 * @param workflow Complete workflow YAML.
 * @returns Parsed budget values and their enforced worst-case total.
 */
export function readSingleRunBudget(workflow: string): SingleRunBudget {
  const proposer = readJobSlice(
    workflow,
    "propose_product_increment",
    "package_product_increment",
  );
  const runSeconds = readPositiveCapture(
    workflow,
    /OPENCODE_RUN_TIMEOUT_SECONDS: "(\d+)"/,
    "OpenCode run timeout",
  );
  const killGraceSeconds = readPositiveCapture(
    workflow,
    /OPENCODE_KILL_GRACE_SECONDS: "(\d+)"/,
    "OpenCode kill grace",
  );
  const jobMinutes = readPositiveCapture(
    proposer,
    /timeout-minutes: (\d+)/,
    "proposal-job timeout",
  );
  const jobSeconds = jobMinutes * 60;
  const totalSeconds = runSeconds + killGraceSeconds
    + SETUP_AND_DIAGNOSTIC_RESERVE_SECONDS;

  return {
    runSeconds,
    killGraceSeconds,
    jobSeconds,
    totalSeconds,
  };
}

/**
 * Return the single OpenCode session step, failing if sequential fallback remains.
 *
 * @param workflow Complete workflow YAML.
 * @returns The single-run step text.
 * @throws {Error} When the single-run step is missing.
 */
export function readSingleOrchestratorRunStep(workflow: string): string {
  const proposer = readJobSlice(
    workflow,
    "propose_product_increment",
    "package_product_increment",
  );
  const start = proposer.indexOf(singleRunStepName);
  if (start < 0) {
    throw new Error("Workflow single orchestrator OpenCode step is missing.");
  }
  return proposer.slice(start);
}
