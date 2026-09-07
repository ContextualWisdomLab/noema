import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("tracks the current orchestrator/free consumer and its stacked evidence-receipt successor", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "PR #535 exact `32972443b121d77a077d1d97c6c702d10fc4c580`",
    );
    expect(baseline).not.toContain(
      "PR #535 exact `a6fc483fe9537c5881114db82cc9f741eb8331b1`",
    );
    expect(baseline).toContain(
      "PR #556 exact `66c15f2121f7198193cdea296d4fb8af9618e67b`",
    );
    expect(baseline).toContain("issue #555 / PR #556");
    expect(baseline).toContain("#535 → #556");
  });
});
