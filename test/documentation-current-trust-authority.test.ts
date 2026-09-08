import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("separates live moving heads from immutable reviewed pins", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("protected `main@59ae66de96b64c8ce51f0030a624815a08dbefdd`");
    expect(baseline).toContain("central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`");
    expect(baseline).toContain("`ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`");
    expect(baseline).toContain("Current source SHA는 moving observation이며 future merge 뒤 evergreen identity로 취급하지 않는다");
    expect(baseline).toContain("Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며");
    expect(baseline).toContain("merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`");
    expect(baseline).toContain("merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`");

    for (const staleAuthority of [
      "protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001`",
      "central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`",
      "protected `main@d6394b2aa73e6fc57fccdad74ea38ad87f79e7f8`",
      "protected `main@e6de53a1c2902cddc09e77a58efb82420cd8f5db`",
      "Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`다.",
    ]) {
      expect(baseline).not.toContain(staleAuthority);
    }
  });
});
