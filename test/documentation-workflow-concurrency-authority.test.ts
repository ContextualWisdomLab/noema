import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workflow-concurrency documentation authority", () => {
  it("treats #550 and #540 as integrated protected history", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`");
    expect(baseline).toContain("#550은 PR-scoped supersession cancellation과 work-conserving dispatch를");
    expect(baseline).toContain("merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`");
    expect(baseline).toContain("protected work-conserving concurrency/admission");
    expect(baseline).toContain("pinned `workerd@1.20260625.1` + `esbuild@0.28.1`");
    expect(baseline).not.toContain("PR #540은 아직 merge authority가 아니다");
    expect(baseline).not.toContain("patch-validator-image 34155490034");
  });
});
