import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canonicalDocuments = [
  "ARCHITECTURE.md",
  "docs/PRD.md",
  "docs/TRD.md",
  "docs/TRACEABILITY.md",
  "docs/product-technical-gap-baseline.md",
] as const;

describe("protected procedural publication-preflight documentation authority", () => {
  it("classifies merged #603 as protected preflight without promoting publication or activation", () => {
    for (const path of canonicalDocuments) {
      const content = readFileSync(path, "utf8");
      expect(content).toContain("#603");
      expect(content).toContain("publication preflight");
    }

    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    const prd = readFileSync("docs/PRD.md", "utf8");
    const trd = readFileSync("docs/TRD.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");

    for (const content of [architecture, prd, trd, traceability, baseline]) {
      expect(content).toContain("publicationAuthorized:false");
      expect(content).toContain("activationAuthorized:false");
    }

    expect(changelog).toContain("PR #603");
    expect(changelog).toContain("publication preflight");
    expect(baseline).toContain("ADR 0017도 `Proposed`다.");
    expect(baseline).toContain("graph publication");
    expect(baseline).not.toContain("#603 candidate");
  });
});
