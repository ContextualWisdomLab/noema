import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AGENTS security-scan applicability", () => {
  it("matches the live default-branch required-workflow ruleset", () => {
    const agents = readFileSync("AGENTS.md", "utf8");

    expect(agents).toContain("ruleset `18794436`");
    expect(agents).toContain("`~DEFAULT_BRANCH`");
    expect(agents).toContain("retargeted to protected `main`");
    expect(agents).not.toContain("stacked feature-base PRs are expected to");
  });
});
