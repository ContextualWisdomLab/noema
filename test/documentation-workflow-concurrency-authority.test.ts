import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workflow-concurrency documentation authority", () => {
  it("treats #550 as integrated protected history and preserves it in #540 convergence", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`");
    expect(baseline).toContain("#550은 PR-scoped supersession cancellation과 work-conserving dispatch를");
    expect(baseline).toContain("PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`");
    expect(baseline).toContain("behind_by=0");
    expect(baseline).toContain("Protected #550 workflow-concurrency semantics");
  });
});
