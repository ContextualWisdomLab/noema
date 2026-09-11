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
});
