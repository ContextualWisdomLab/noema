import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function workflowText(): string {
  return readFileSync(
    ".github/workflows/hourly-product-development.yml",
    "utf8",
  );
}

describe("hourly product-development final-candidate cleanup", () => {
  it("runs bounded cleanup only between failed model candidates", () => {
    const workflow = workflowText();
    const candidateTimeout = Number(
      workflow.match(/OPENCODE_RUN_TIMEOUT_SECONDS: "(\d+)"/)?.[1],
    );
    const candidateGrace = Number(
      workflow.match(/OPENCODE_KILL_GRACE_SECONDS: "(\d+)"/)?.[1],
    );
    const reinstallTimeout = Number(
      workflow.match(/DEPENDENCY_REINSTALL_TIMEOUT_SECONDS: "(\d+)"/)?.[1],
    );
    const reinstallGrace = Number(
      workflow.match(/DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS: "(\d+)"/)?.[1],
    );
    const jobMinutes = Number(
      workflow.match(/propose_product_increment:[\s\S]*?timeout-minutes: (\d+)/)?.[1],
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

    const candidateListIndex = workflow.indexOf(
      'read -r -a model_candidates <<<"$OPENCODE_MODEL_CANDIDATES"',
    );
    const candidateLoopIndex = workflow.indexOf(
      "for ((candidate_index = 0; candidate_index < candidate_count; candidate_index++)); do",
    );
    const finalCandidateGuardIndex = workflow.indexOf(
      'if [ "$candidate_index" -eq $((candidate_count - 1)) ]; then',
    );
    const resetIndex = workflow.indexOf(
      'git -C "$GITHUB_WORKSPACE" reset --hard HEAD',
    );
    const reinstallIndex = workflow.indexOf(
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
