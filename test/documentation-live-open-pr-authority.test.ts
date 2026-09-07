import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("tracks current open lanes while keeping the moving evidence stack observation-scoped", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("PR #535 exact `e996b509f699c3f942ef81f0ac52b804b783cd19`");
    expect(baseline).toContain("PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`");
    expect(baseline).toContain("observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`");
    expect(baseline).toContain("live #556 must be re-fetched before integration");
    expect(baseline).toContain("issue #555 / PR #556");
    expect(baseline).not.toContain("PR #535 exact `59205b5ae333a1f2b5e6b2112bf059592ba492c9`");
    expect(baseline).not.toContain("PR #535 exact `4ad6907ae9f97b202a32a9b5e170f275ac9129b9`");
  });
});
