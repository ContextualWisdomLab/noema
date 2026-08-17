import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readSingleOrchestratorRunStep,
  readSingleRunBudget,
} from "./helpers/hourly-workflow";

function workflowText(): string {
  return readFileSync(
    ".github/workflows/hourly-product-development.yml",
    "utf8",
  );
}

describe("hourly product-development sequential-model prohibition", () => {
  it("runs exactly one gateway-backed session and never fails over to the next model", () => {
    const workflow = workflowText();
    const budget = readSingleRunBudget(workflow);
    const runStep = readSingleOrchestratorRunStep(workflow);

    expect(budget.totalSeconds).toBeLessThanOrEqual(budget.jobSeconds);
    expect(workflow).not.toContain("OPENCODE_MODEL_CANDIDATES");
    expect(workflow).not.toContain("nvidia-nim/");
    expect(workflow).not.toContain(
      "for model in $OPENCODE_MODEL_CANDIDATES; do",
    );
    expect(workflow).not.toContain("candidate_index");
    expect(workflow).not.toContain("model_candidates");
    expect(runStep).toContain("opencode run \"$prompt\" --agent build");
    expect(runStep).not.toContain("--model");
    expect(runStep).not.toContain("git reset --hard HEAD");
    expect(runStep).not.toContain("git clean -fdx");
  });
});
