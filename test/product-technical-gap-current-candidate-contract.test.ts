import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product technical gap current candidate authority", () => {
  it("tracks the current reviewer foundation and dependent heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("PR #536 exact `fdf1d8e2fc49a99f95fa7b3f20a11ab24e46aab3`");
    expect(baseline).toContain("PR #535 exact `329069405181921091397d31687f2c5f7a98ae54`");
    expect(baseline).toContain("PR #556 exact `2b123ec538bf248d0a388a2b265f41722170026f`");
  });
});
