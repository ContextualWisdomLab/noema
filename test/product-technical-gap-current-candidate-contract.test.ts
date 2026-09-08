import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product technical gap current candidate authority", () => {
  it("tracks protected truth and separates active candidates from integrated history", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const currentTruth of [
      "protected `main@59ae66de96b64c8ce51f0030a624815a08dbefdd`",
      "central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`",
      "PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`",
      "merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`",
      "merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`",
      "merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`",
      "observed PR #556 exact `29cb77bb943dcd93d65f959f20f50a0622e0ba4a`",
      "merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`",
      "merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`",
      "merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`",
    ]) {
      expect(baseline).toContain(currentTruth);
    }
    expect(baseline).toContain("live #556 must be re-fetched before integration");
    expect(baseline).toContain("predecessor GREEN");

    for (const staleTruth of [
      "central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`",
      "protected `main@699489cdbb8de3404154d9a3d6022c692ce85fd6`",
      "protected `main@d6394b2aa73e6fc57fccdad74ea38ad87f79e7f8`",
      "PR #535 exact `e0a329916ab71b1009aa62cbab667a737d511223`",
      "PR #535 exact `551d81da28b0c03ca44deedf60e95125dcceb81b`",
      "PR #535 exact `06ed62fcc5611e9b25ef38b06e87e7521dbf1be1`",
      "PR #535 exact `6739f0ab58e81dc56ea1485a5dea0f39e1cdfd3a`",
      "PR #558 exact `f2aa8570d952cc0a371da161e651472c080e00ce`",
      "observed PR #556 exact `9d6d52c1dd4fc88203a832b509f4ec28cef3c68a`",
      "observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`",
      "PR #540은 아직 merge authority가 아니다",
    ]) {
      expect(baseline).not.toContain(staleTruth);
    }
  });
});