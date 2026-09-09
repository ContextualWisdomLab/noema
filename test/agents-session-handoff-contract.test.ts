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
});
