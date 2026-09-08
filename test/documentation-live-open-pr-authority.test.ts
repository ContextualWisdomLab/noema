import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("separates active source lanes from integrated protected history and observation-scoped downstream heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("protected `main@699489cdbb8de3404154d9a3d6022c692ce85fd6`");
    expect(baseline).toContain("PR #535 exact `06ed62fcc5611e9b25ef38b06e87e7521dbf1be1`");
    expect(baseline).toContain("PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`");
    expect(baseline).toContain("merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`");
    expect(baseline).toContain("merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`");
    expect(baseline).toContain("observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`");
    expect(baseline).toContain("live #556 must be re-fetched before integration");
    expect(baseline).toContain("issue #555 / PR #556");
    expect(baseline).not.toContain("PR #535 exact `6739f0ab58e81dc56ea1485a5dea0f39e1cdfd3a`");
    expect(baseline).not.toContain("PR #535 exact `e996b509f699c3f942ef81f0ac52b804b783cd19`");
    expect(baseline).not.toContain("PR #535 exact `59205b5ae333a1f2b5e6b2112bf059592ba492c9`");
    expect(baseline).not.toContain("PR #535 exact `4ad6907ae9f97b202a32a9b5e170f275ac9129b9`");
    expect(baseline).not.toContain("PR #558 exact `f2aa8570d952cc0a371da161e651472c080e00ce`");
    expect(baseline).not.toContain("PR #540은 아직 merge authority가 아니다");
    expect(baseline).not.toContain("PR #547은 이 문서와 executable documentation authority contract의 sole writer다");
  });
});