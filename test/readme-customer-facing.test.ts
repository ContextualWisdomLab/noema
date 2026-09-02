import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

describe("README stays customer/operator facing", () => {
  const readme = readText("README.md");
  const contributing = readText("CONTRIBUTING.md");
  const procedure = readText("docs/development/contributor-and-agent-procedure.md");

  it("leads with product value, supported surfaces, onboarding, and trust boundaries", () => {
    for (const requiredText of [
      "Evidence-producing credential and maintenance control plane",
      "What Noema does",
      "/health",
      "/ready",
      "/exchange",
      "contracts/orchestrator-gateway.json",
      "openapi.json",
      "npm run dev",
      "wrangler secret put",
      "GITHUB_APP_ID",
      "NOEMA_LLM_API_URL",
      "NOEMA_LLM_API_KEY",
      "contextual-orchestrator",
      "GitHub App permissions",
      "Security model",
      "Verify the repository",
      "Apache License 2.0",
    ]) {
      expect(readme).toContain(requiredText);
    }
  });

  it("does not keep internal topology or bot-manual leftovers in README", () => {
    expect(readme).not.toContain("GITHUB_APP_SLUG");
    for (const leftover of [
      "leaf product",
      "따로 또 같이",
      "CloudAgent",
      "OpenCode 1.17.13",
      "OpenCode session",
      "OpenCode Agent",
      "PR stacking",
      "stacked PR",
      "do-not-merge",
      "writer/agent",
      "writer and agent",
      "exact-head CI",
      "proposal-only OpenCode",
    ]) {
      expect(readme, `README must not contain internal/bot-manual leftover: ${leftover}`).not.toContain(
        leftover,
      );
    }
  });

  it("keeps contributor and agent procedure in internal documentation", () => {
    expect(contributing).toContain("docs/development/contributor-and-agent-procedure.md");
    expect(contributing).toContain("hourly-product-development.yml");
    expect(contributing).toContain("exact-head");
    expect(contributing).toContain("Do not put CloudAgent");

    for (const requiredText of [
      "Writer and agent boundaries",
      "central-review",
      "pr_head_sha",
      "OpenCode session",
      "exact-head CI",
      "PR stacking",
      "Do not merge",
      "CloudAgent",
      "hourly-product-development.yml",
    ]) {
      expect(procedure).toContain(requiredText);
    }
  });
});
