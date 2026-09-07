import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product technical gap current candidate authority", () => {
  it("tracks the current shared-kernel and exact-claim receipt heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("PR #536 exact `fdf1d8e2fc49a99f95fa7b3f20a11ab24e46aab3`");
    expect(baseline).toContain("PR #556 exact `809aa6d1d0e429a44940f0978ae985c8295beaab`");
  });
});
