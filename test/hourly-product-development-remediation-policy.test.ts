import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";

/** Return the bounded OpenCode task prompt consumed by the hourly scheduler. */
function scheduledTaskPrompt(): string {
  const workflow = readFileSync(workflowPath, "utf8");
  const startMarker = "cat >\"$RUNNER_TEMP/noema-agent-prompt.md\" <<'PROMPT'";
  const start = workflow.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const bodyStart = start + startMarker.length;
  const end = workflow.indexOf("\n          PROMPT", bodyStart);
  expect(end).toBeGreaterThan(bodyStart);
  return workflow.slice(bodyStart, end);
}

describe("hourly product-development realistic remediation policy", () => {
  it("requires evidence-backed alternatives before escalating a tooling blocker", () => {
    const guidance = readFileSync("AGENTS.md", "utf8");
    const prompt = scheduledTaskPrompt();

    expect(prompt).toContain("Begin by reading AGENTS.md");
    for (const requiredContract of [
      "### Realistic remediation before escalation",
      "Do not stop at the first unavailable tool",
      "enumerate every safe candidate path",
      "read-only, dry-run, or no-op evidence",
      "exact current pull-request head",
      "current blob SHA",
      "deterministic minimal transformation",
      "no unrelated diff",
      "Only report a tooling or permission blocker after",
      "concretely proven infeasible",
      "Never create, restore, or use repair workflows",
    ]) {
      expect(guidance).toContain(requiredContract);
    }
  });

  it("requires RCA and an empirical feasibility gate before scheduler action", () => {
    const guidance = readFileSync("AGENTS.md", "utf8");
    const prompt = scheduledTaskPrompt();

    expect(prompt).toContain("Begin by reading AGENTS.md");
    for (const requiredContract of [
      "Mandatory RCA and feasibility protocol",
      "capture exact evidence",
      "falsifiable root-cause hypothesis",
      "materially distinct remediation candidates",
      "authority, capability, exact target, policy, reversibility, remaining time",
      "observable test oracle",
      "execute_now, defer_until_trigger, external_only, or reject",
      "Do not stop at naming a blocker",
      "uncredentialed proposal workspace",
      "cannot clear GitHub approvals, required Checks, repository settings, secrets, or external infrastructure",
      "continue bounded non-conflicting work",
    ]) {
      expect(guidance).toContain(requiredContract);
    }
  });
});
