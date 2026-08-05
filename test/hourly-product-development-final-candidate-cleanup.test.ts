import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readCandidateBudget,
  readCandidateControlFlow,
} from "./helpers/hourly-workflow";

function workflowText(): string {
  return readFileSync(
    ".github/workflows/hourly-product-development.yml",
    "utf8",
  );
}

describe("hourly product-development final-candidate cleanup", () => {
  it("runs bounded cleanup only between failed model candidates", () => {
    const workflow = workflowText();
    const budget = readCandidateBudget(workflow);
    const controlFlow = readCandidateControlFlow(workflow);

    expect(budget.candidateCount).toBe(3);
    expect(budget.interCandidateCleanupCount).toBe(2);
    expect(budget.totalSeconds).toBeLessThanOrEqual(budget.jobSeconds);
    expect(controlFlow.candidateLoopIndex).toBeGreaterThan(
      controlFlow.candidateListIndex,
    );
    expect(controlFlow.finalCandidateGuardIndex).toBeGreaterThan(
      controlFlow.candidateLoopIndex,
    );
    expect(controlFlow.finalCandidateGuardIndex).toBeLessThan(
      controlFlow.resetIndex,
    );
    expect(controlFlow.resetIndex).toBeLessThan(controlFlow.reinstallIndex);
    expect(workflow).not.toContain(
      "for model in $OPENCODE_MODEL_CANDIDATES; do",
    );
  });
});
