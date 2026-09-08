import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("separates integrated protected history from current feature candidates", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`");
    expect(baseline).toContain("merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`");
    expect(baseline).toContain("merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`");
    expect(baseline).toContain("merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`");
    expect(baseline).toContain("merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`");
    expect(baseline).toContain("Observed PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`");
    expect(baseline).toContain("Observed PR #560 test-only exact `58f8bbadd6a4a3863d642883e40f4753f6dc291f`");
    expect(baseline).toContain("default `main`을 base로 한다");
    expect(baseline).toContain("live #556 must be re-fetched before integration");
    expect(baseline).toContain("Test-only `dbab4cdc150d4973002f8b61173282f7c7542725`");
    expect(baseline).toContain("Production `440346ee73e60e87915bd3027a774e24d3ac5124`");
    expect(baseline).toContain("reviewer-ci RED");
    expect(baseline).toContain("Run `34190991526`");
    expect(baseline).toContain("`1cd8db5a94ed420bed8b52be0d3b3354f9fc86ab`");
    expect(baseline).toContain("required Security Scan `34197596536`");
    expect(baseline).toContain("issue #555 / PR #556");
    expect(baseline).toContain("issue #545 / PR #560");
    expect(baseline).toContain("application CI `34197933796`");

    for (const staleAuthority of [
      "Observed PR #556 exact `809ccb78bfdf8f9785d4c74ab834159961cce6e9`",
      "Observed PR #556 exact `920eb7be0c3f57c5f149328a08beddc13339a338`",
      "Observed PR #556 exact `363d62bc888e7b9555ff56bbce4dadc0a61d4efb`",
      "observed PR #556 exact `29cb77bb943dcd93d65f959f20f50a0622e0ba4a`",
      "observed PR #556 exact `9d6d52c1dd4fc88203a832b509f4ec28cef3c68a`",
      "observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`",
      "required Security Scan은 exact-head run inventory에서 ABSENT",
    ]) {
      expect(baseline).not.toContain(staleAuthority);
    }
  });
});
