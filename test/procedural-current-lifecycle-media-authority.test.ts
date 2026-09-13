import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("protected procedural current-lifecycle media documentation authority", () => {
  it("records protected #704 without promoting Workflow / Task or production authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/agent-runtime/procedural-current-lifecycle.ts", "utf8");

    expect(changelog).toContain("Protected #704");
    expect(changelog).toContain("42b15e865bdf88fde622c3bba2c0b123770d18be");
    expect(changelog).toContain("e8c2002e5af8fa5611880091dab81916bb716c35");
    expect(changelog).toContain("application/json; charset=utf-8");
    expect(changelog).toContain("invalid_workflow_state_response");
    expect(changelog).toContain("best-effort cleanup");

    expect(baseline).toContain(
      "merged PR #704 exact `42b15e865bdf88fde622c3bba2c0b123770d18be`",
    );
    expect(baseline).toContain("GitHub-verified normal merge `e8c2002e5af8fa5611880091dab81916bb716c35`");
    expect(baseline).toContain("application/json; charset=utf-8");
    expect(baseline).toContain("stable `invalid_workflow_state_response`");
    expect(baseline).toContain("best-effort cleanup");
    expect(baseline).toContain("immutable release");
    expect(baseline).not.toContain("#704 transfers Workflow / Task lifecycle authority to Agent Runtime");

    expect(source).toContain("function isJsonMediaType(value: string | null): boolean");
    expect(source).toContain("Noema current workflow-state response used an unsupported media type");
  });
});
