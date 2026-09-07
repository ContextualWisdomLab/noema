const singleRunStepName = "- name: Run one contextual-orchestrator OpenCode session";

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
