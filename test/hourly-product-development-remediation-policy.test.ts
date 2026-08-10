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
      "OpenCode proposer is credential-bearing only for the NVIDIA NIM provider",
      "model-selected shell execution is denied by the trusted project plugin",
      "has no merge, release, deployment, GitHub approval, required-Check, repository-setting, or external-infrastructure authority",
      "separate uncredentialed verifier path",
      "continue bounded non-conflicting work",
    ]) {
      expect(guidance).toContain(requiredContract);
    }
  });

  it("keeps credential-bearing proposal claims separate from executable verifier evidence", () => {
    const prompt = scheduledTaskPrompt().replace(/\s+/g, " ");

    for (const requiredContract of [
      "credential-bearing proposer has no shell execution authority",
      "Do not claim that you executed tests or shell commands",
      "expected pre-implementation RED condition",
      "separate uncredentialed verifier",
      "execution results pending trusted verifier evidence",
    ]) {
      expect(prompt).toContain(requiredContract);
    }

    expect(prompt).not.toContain("Run focused tests and npm run release:verify.");
    expect(prompt).not.toContain("RED-to-GREEN evidence, complete verification commands and");
  });

  it("requires every intermediate artifact to hand off to the next executable lane", () => {
    const guidance = readFileSync("AGENTS.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const prompt = scheduledTaskPrompt();

    expect(prompt).toContain("Begin by reading AGENTS.md");
    for (const requiredContract of [
      "### Work-conserving continuation and deliverable handoff",
      "A prompt update, documentation assessment, design, RCA, test, commit, review request, merge, or blocked lane is an intermediate state",
      "RCA must hand off to a feasible action",
      "design must hand off to implementation",
      "test must hand off to production code",
      "documentation assessment must hand off to canonical repository files",
      "local changes must hand off to an intentional commit and pull request",
      "pull request must hand off to exact-head checks, review remediation, and merge",
      "merge must hand off to protected-main operational acceptance",
      "documentation repair must be followed by the highest-value non-documentation work",
      "mandatory double exit sweep",
      "A user-visible report is never completion",
    ]) {
      expect(guidance).toContain(requiredContract);
    }

    expect(changelog).toContain("deliverable handoff");
    expect(changelog).toContain("double exit sweep");
    expect(changelog).toContain("intermediate state");
  });

  it("classifies the central Security Scan absence on feature-base stacks without inventing success", () => {
    const guidance = readFileSync("AGENTS.md", "utf8");

    for (const requiredContract of [
      "Central Security Scan currently triggers only for pull requests whose base branch is `main`, `master`, or `develop`",
      "stacked pull request whose base is another feature branch",
      "defer_until_trigger",
      "never as passing evidence",
      "retargeted or rebased after its predecessor integrates",
      "Do not retarget a stacked pull request merely to manufacture the check",
      "duplicate its predecessor's diff or violate dependency order",
    ]) {
      expect(guidance).toContain(requiredContract);
    }
  });
});