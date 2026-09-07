import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product technical gap current candidate authority", () => {
  it("tracks protected truth and separates active candidates from integrated history", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const currentTruth of [
      "protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001`",
      "central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`",
      "PR #535 exact `e996b509f699c3f942ef81f0ac52b804b783cd19`",
      "merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`",
      "observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`",
      "merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`",
      "merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`",
      "merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`",
    ]) {
      expect(baseline).toContain(currentTruth);
    }
    expect(baseline).toContain("live #556 must be re-fetched before integration");
    expect(baseline).toContain("predecessor GREEN");

    for (const staleTruth of [
      "protected `main@d6394b2aa73e6fc57fccdad74ea38ad87f79e7f8`",
      "protected `main@e6de53a1c2902cddc09e77a58efb82420cd8f5db`",
      "PR #535 exact `4ad6907ae9f97b202a32a9b5e170f275ac9129b9`",
      "PR #542 exact `195fdd70b267332f246d93beb95fa96fabade52e`",
      "PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`도 protected",
      "PR #553 exact `c03d946f52faf65b1f9b75c3c601fed106ffcbd0`",
      "PR #540은 아직 merge authority가 아니다",
      "patch-validator-image 34155490034",
    ]) {
      expect(baseline).not.toContain(staleTruth);
    }
  });
});
