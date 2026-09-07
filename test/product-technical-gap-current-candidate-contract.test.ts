import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product technical gap current candidate authority", () => {
  it("tracks protected truth, the reviewer foundation, and dependent heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "main@5cd6341866a53351ff412415f677ec2fef23ea33",
    );
    expect(baseline).toContain(
      "merged PR #543 exact `b14b37ca12b3b6ae1999d250a393997ffff04dec`",
    );
    expect(baseline).toContain(
      "PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`",
    );
    expect(baseline).toContain(
      "PR #535 exact `329069405181921091397d31687f2c5f7a98ae54`",
    );
    expect(baseline).toContain(
      "PR #556 exact `863bb2d98ae307118d2528dc05c4695c78b16b12`",
    );
  });
});
