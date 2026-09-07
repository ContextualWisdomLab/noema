import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workflow-concurrency documentation authority", () => {
  it("records the current post-#548 #550 exact head and protected-base convergence", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`",
    );
    expect(baseline).toContain("ordinary/non-force semantic convergence");
    expect(baseline).toContain("behind_by=0");
    expect(baseline).toContain("Protected #536 reviewer-ci/package wiring");
    expect(baseline).not.toContain(
      "PR #550 exact `210fd23f001d4b7ff124480fbbed0c26640b3d12`",
    );
    expect(baseline).not.toContain(
      "PR #550 exact `aeb9c46e51a2de2ec4ad9dd16a73b3548109385e`",
    );
  });
});
