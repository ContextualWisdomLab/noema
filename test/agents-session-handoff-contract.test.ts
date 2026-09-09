import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const agents = readFileSync("AGENTS.md", "utf8");

describe("cross-session handoff guidance", () => {
  it("never treats an ordinary merge as automatic complete succession", () => {
    expect(agents).not.toContain(
      "a normally merged successor fully supersedes a stale predecessor",
    );
    expect(agents).toContain("verified complete inheritance");
    expect(agents).toContain("delta, test, fixture, contract, and evidence");
    expect(agents).toContain("keep both lanes open");
  });

  it("requires causal reproduction before classifying a local failure as platform-only", () => {
    expect(agents).not.toContain(
      "Treat such failures as platform divergence,\n  not regression",
    );
    expect(agents).toContain("reproduce or isolate the platform-specific cause");
    expect(agents).toContain("do not dismiss an unexplained local failure as platform divergence");
  });

  it("keeps slow image work lane-scoped without weakening exact-head merge authority", () => {
    expect(agents).toContain("a waiting image result blocks only that PR lane");
    expect(agents).toContain("application CI, reviewer-ci, Security Scan, and patch-validator-image");
    expect(agents).toContain("ordinary/non-force reconverge");
    expect(agents).toContain("do not use destructive reset");
    expect(agents).not.toContain("the only required merge gate is the central Security Scan");
  });
});
