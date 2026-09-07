import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workflow-concurrency documentation authority", () => {
  it("records the current post-#543 #550 exact head and protected-base convergence", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "PR #550 exact `289fbb002c8e8fb0fcb3ee947901574fc7c3fd88`",
    );
    expect(baseline).toContain("ordinary two-parent/non-force 수렴");
    expect(baseline).toContain("behind_by=0");
    expect(baseline).toContain("merge-base는 current protected main");
    expect(baseline).not.toContain(
      "PR #550 exact `aeb9c46e51a2de2ec4ad9dd16a73b3548109385e`",
    );
  });
});