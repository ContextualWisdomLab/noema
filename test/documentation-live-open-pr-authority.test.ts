import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("separates active source lanes from integrated protected history and observation-scoped downstream heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("protected `main@59ae66de96b64c8ce51f0030a624815a08dbefdd`");
    expect(baseline).toContain("PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`");
    expect(baseline).toContain("merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`");
    expect(baseline).toContain("merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`");
    expect(baseline).toContain("merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`");
    expect(baseline).toContain("Observed PR #556 exact `363d62bc888e7b9555ff56bbce4dadc0a61d4efb`");
    expect(baseline).toContain("base는 PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`");
    expect(baseline).toContain("live #556 must be re-fetched before integration");
    expect(baseline).toContain("required Security Scan은 exact-head run inventory에서 ABSENT");
    expect(baseline).toContain("exemption이 아니라 owner-path routing defect");
    expect(baseline).toContain("issue #555 / PR #556");

    for (const staleAuthority of [
      "PR #535 exact `551d81da28b0c03ca44deedf60e95125dcceb81b`",
      "PR #535 exact `06ed62fcc5611e9b25ef38b06e87e7521dbf1be1`",
      "PR #535 exact `6739f0ab58e81dc56ea1485a5dea0f39e1cdfd3a`",
      "observed PR #556 exact `29cb77bb943dcd93d65f959f20f50a0622e0ba4a`",
      "observed PR #556 exact `9d6d52c1dd4fc88203a832b509f4ec28cef3c68a`",
      "observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`",
    ]) {
      expect(baseline).not.toContain(staleAuthority);
    }
  });
});
