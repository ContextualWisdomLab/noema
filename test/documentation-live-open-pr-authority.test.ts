import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("tracks the current orchestrator/free consumer while keeping the moving evidence stack observation-scoped", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "PR #535 exact `59205b5ae333a1f2b5e6b2112bf059592ba492c9`",
    );
    expect(baseline).not.toContain(
      "PR #535 exact `329069405181921091397d31687f2c5f7a98ae54`",
    );
    expect(baseline).not.toContain(
      "PR #535 exact `a6fc483fe9537c5881114db82cc9f741eb8331b1`",
    );
    expect(baseline).toContain("observed PR #556 exact `");
    expect(baseline).toContain(
      "live #556 must be re-fetched before integration",
    );
    expect(baseline).toContain("issue #555 / PR #556");
    expect(baseline).toContain("#535 → #556");
  });
});
