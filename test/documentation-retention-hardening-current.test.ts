import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected retention-hardening documentation authority", () => {
  it("preserves merged #650 retention-hardening history after later protected-main advancement", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "merged PR #642 exact `3427e5a66d7a0ea9379ddc7915ba2b3d1872c492`",
    );
    expect(baseline).toContain(
      "merged PR #643 exact `b13903e3208232086871d7f117f8f20e753eb583`",
    );
    expect(baseline).toContain(
      "merged PR #644 exact `79a89f5775d0fb56de9f1908c1927df0b498b70f`",
    );
    expect(baseline).toContain(
      "merged PR #645 exact `1b4dc38581e99b92342769dd03059f5015ee9f04`",
    );
    expect(baseline).toContain(
      "merged PR #646 exact `3005086fca2c6376fae951b774230fa1c06ba587`",
    );
    expect(baseline).toContain(
      "merged PR #647 exact `ea3a36bc65df88153aa69a05e3144f0b5352b5a6`",
    );
    expect(baseline).toContain(
      "merged PR #648 exact `133ce20c4bb7fb9ba05e3e4bedeb0492334faf38`",
    );
    expect(baseline).toContain(
      "merged PR #649 exact `f334f40193da8811a6e15efcb2d589aa80104931`",
    );
    expect(baseline).toContain(
      "merged PR #650 exact `f59fce008a4da70f89e9927f692b823506594ed5`",
    );
    expect(baseline).toContain("bounded retained-memory hardening");
    expect(baseline).toContain("Stream fragmentation");
    expect(baseline).toContain("deployed heap/p95 evidence remains separate");
    expect(baseline).not.toContain("#650 proves production performance");
  });

  it("records protected #655 replay-reader lifecycle hardening without promoting deployment evidence", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");

    expect(baseline).toContain(
      "merged PR #655 exact `dc851fc9ea67e38799e8c30cf4916a31c9e9661e`",
    );
    expect(baseline).toContain("reader lock");
    expect(baseline).toContain("4,096-byte");
    expect(baseline).toContain("512-byte");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #655");
    expect(changelog).toContain("reader lock");
    expect(changelog).toContain("4,096");
    expect(changelog).toContain("512");
    expect(baseline).not.toContain("#655 proves production performance");
  });

  it("records protected #657 distributed rate-limit reader lifecycle and distinguishes pre-reader validation", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/rate-limit.ts", "utf8");

    expect(baseline).toContain(
      "merged PR #657 exact `fa4a2ab25231fa4c8b9a8451a4da6f29e04abaf7`",
    );
    expect(baseline).toContain("256-byte");
    expect(baseline).toContain("4,096-byte");
    expect(baseline).toContain("reader lock");
    expect(baseline).toContain("after reader acquisition");
    expect(baseline).toContain("before reader acquisition");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #657");
    expect(changelog).toContain("256-byte");
    expect(changelog).toContain("4,096-byte");
    expect(changelog).toContain("reader lock");
    expect(changelog).toContain("after reader acquisition");
    expect(changelog).toContain("before reader acquisition");
    expect(source).toMatch(
      /\/\*\*[\s\S]*?256-byte[\s\S]*?reader lock[\s\S]*?\*\/\nasync function readBoundedRateLimitRequest/,
    );
    expect(source).toMatch(
      /\/\*\*[\s\S]*?4,096-byte[\s\S]*?reader lock[\s\S]*?\*\/\nasync function readBoundedRateLimitDecision/,
    );
    expect(baseline).not.toContain("#657 proves production performance");
  });

  it("records protected #659 outbound response reader lifecycle without importing outbound authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/outbound-fetch-policy.ts", "utf8");

    expect(baseline).toContain(
      "merged PR #659 exact `6357ac65db6a0db9f3bbb3f82196853b787f33cc`",
    );
    expect(baseline).toContain("bounded outbound response");
    expect(baseline).toContain("reader lock");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #659");
    expect(changelog).toContain("bounded outbound response");
    expect(changelog).toContain("reader lock");
    expect(source).toMatch(
      /\/\*\*[\s\S]*?bounded outbound response[\s\S]*?reader lock[\s\S]*?\*\/\nasync function boundedOutboundResponse/,
    );
    expect(baseline).toContain(
      "#659 does not transfer destination policy or foreign outbound authority to Noema.",
    );
    expect(baseline).not.toMatch(
      /#659\s+(?:grants?|assigns?|delegates?|moves?|imports?)\b[\s\S]{0,120}\b(?:outbound authorization|destination policy|credential-egress authorization|provider routing|quarantine(?:\/security)?|security authority|foreign outbound authority)\b[\s\S]{0,80}\b(?:to|into)\s+Noema\b/i,
    );
    expect(baseline).not.toContain("#659 proves production performance");
  });

  it("records protected #661 exchange request reader lifecycle without importing foreign authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/entrypoint.ts", "utf8");

    expect(baseline).toContain(
      "merged PR #661 exact `5a5e147c5a7168277332eb828652b4aea4f7f2ba`",
    );
    expect(baseline).toContain("public `/exchange` JSON request body");
    expect(baseline).toContain("8 KiB");
    expect(baseline).toContain("10-second");
    expect(baseline).toContain("reader lock");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #661");
    expect(changelog).toContain("public `/exchange` JSON request body");
    expect(changelog).toContain("8 KiB");
    expect(changelog).toContain("10-second");
    expect(changelog).toContain("reader lock");
    expect(source).toMatch(
      /\/\*\*[\s\S]*?request-body reader[\s\S]*?released[\s\S]*?\*\/\nexport async function boundExchangeJsonBody/,
    );
    expect(baseline).toContain(
      "#661 does not transfer provider routing, destination policy or foreign outbound authority, credential authority, quarantine/security verdicts, or foreign domain truth to Noema.",
    );
    expect(baseline).not.toContain("#661 proves production performance");
  });
});
