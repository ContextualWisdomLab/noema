import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workflow-concurrency documentation authority", () => {
  it("records the current post-#526 #550 exact head while retaining predecessor lineage", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "PR #550 exact `aeb9c46e51a2de2ec4ad9dd16a73b3548109385e`",
    );
    expect(baseline).toContain(
      "predecessor #550 `3ed5bd956c84e6dd2ebe604dc226fea82145ac29`",
    );
    expect(baseline).toContain("behind_by=0");
    expect(baseline).toContain("merge-base exactly current protected main");
  });
});
