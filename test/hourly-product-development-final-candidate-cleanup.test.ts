import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function workflowText(): string {
  return readFileSync(
    ".github/workflows/hourly-product-development.yml",
    "utf8",
  );
}

/** Return one required decimal capture or fail with the missing contract name. */
function requiredDecimal(
  text: string,
  pattern: RegExp,
  contractName: string,
): number {
  const match = text.match(pattern);
  expect(match, `${contractName} must exist`).not.toBeNull();
  return Number(match?.[1]);
}

/** Extract one complete workflow job without matching similarly named dependencies. */
function jobSlice(
  workflow: string,
  jobName: string,
  nextJobName: string,
): string {
  const start = workflow.indexOf(`  ${jobName}:`);
  const end = workflow.indexOf(`  ${nextJobName}:`, start + 1);
  expect(start, `${jobName} job must exist`).toBeGreaterThan(-1);
  expect(end, `${nextJobName} job must follow ${jobName}`).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("hourly product-development final-candidate cleanup", () => {
  it("runs bounded cleanup only between failed model candidates", () => {
    const workflow = workflowText();
    const proposer = jobSlice(
      workflow,
      "propose_product_increment",
      "package_product_increment",
    );
    const candidateTimeout = requiredDecimal(
      workflow,
      /OPENCODE_RUN_TIMEOUT_SECONDS: "(\d+)"/,
      "candidate timeout",
    );
    const candidateGrace = requiredDecimal(
      workflow,
      /OPENCODE_KILL_GRACE_SECONDS: "(\d+)"/,
      "candidate termination grace",
    );
    const reinstallTimeout = requiredDecimal(
      workflow,
      /DEPENDENCY_REINSTALL_TIMEOUT_SECONDS: "(\d+)"/,
      "dependency reinstall timeout",
    );
    const reinstallGrace = requiredDecimal(
      workflow,
      /DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS: "(\d+)"/,
      "dependency reinstall termination grace",
    );
    const jobMinutes = requiredDecimal(
      proposer,
      /timeout-minutes: (\d+)/,
      "proposal job timeout",
    );
    const candidateCount = workflow.match(/^    nvidia-nim\/.+$/gm)?.length ?? 0;
    const interCandidateCleanupCount = Math.max(candidateCount - 1, 0);
    const reserveSeconds = 300;

    expect(candidateCount).toBe(3);
    expect(interCandidateCleanupCount).toBe(2);
    expect(
      candidateCount * (candidateTimeout + candidateGrace)
      + interCandidateCleanupCount * (reinstallTimeout + reinstallGrace)
      + reserveSeconds,
    ).toBeLessThanOrEqual(jobMinutes * 60);

    const candidateListIndex = proposer.indexOf(
      'read -r -a model_candidates <<<"$OPENCODE_MODEL_CANDIDATES"',
    );
    const candidateLoopIndex = proposer.indexOf(
      "for ((candidate_index = 0; candidate_index < candidate_count; candidate_index++)); do",
    );
    const finalCandidateGuardIndex = proposer.indexOf(
      'if [ "$candidate_index" -eq $((candidate_count - 1)) ]; then',
    );
    const resetIndex = proposer.indexOf(
      'git -C "$GITHUB_WORKSPACE" reset --hard HEAD',
    );
    const reinstallIndex = proposer.indexOf(
      'timeout --kill-after="${DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS}s" "${DEPENDENCY_REINSTALL_TIMEOUT_SECONDS}s" npm ci --ignore-scripts',
    );

    expect(candidateListIndex).toBeGreaterThan(-1);
    expect(candidateLoopIndex).toBeGreaterThan(candidateListIndex);
    expect(finalCandidateGuardIndex).toBeGreaterThan(candidateLoopIndex);
    expect(finalCandidateGuardIndex).toBeLessThan(resetIndex);
    expect(resetIndex).toBeLessThan(reinstallIndex);
    expect(workflow).not.toContain(
      "for model in $OPENCODE_MODEL_CANDIDATES; do",
    );
  });
});
