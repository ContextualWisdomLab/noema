import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adr = readFileSync("docs/adr/0017-procedural-graph-guidance.md", "utf8");

describe("procedural publication preflight documentation authority", () => {
  it("classifies #603 as candidate preflight rather than publication or activation authority", () => {
    expect(adr).toContain("Candidate #603 adds a publication-time preflight");
    expect(adr).toContain("publicationAuthorized: false");
    expect(adr).toContain("activationAuthorized: false");
    expect(adr).toContain("does not publish or activate a graph");
    expect(adr).toContain("ADR-0017 remains `Proposed`");
  });
});
