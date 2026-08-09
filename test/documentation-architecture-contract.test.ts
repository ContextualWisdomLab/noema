import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredDocuments = [
  "docs/PRD.md",
  "docs/TRD.md",
  "ARCHITECTURE.md",
  "docs/adr/README.md",
  "docs/adr/0001-evidence-authority-separation.md",
  "docs/adr/0002-work-conserving-autonomy.md",
  "docs/UML.md",
  "docs/ERD.md",
  "docs/TRACEABILITY.md",
  "docs/TEST_STRATEGY.md",
  "docs/OPERABILITY.md",
] as const;

/** Read one required architecture document after asserting that it exists. */
function requiredDocument(path: (typeof requiredDocuments)[number]): string {
  expect(existsSync(path), `${path} must be committed`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("authoritative Noema architecture documentation", () => {
  it("keeps the canonical documentation graph discoverable from GitHub", () => {
    for (const path of requiredDocuments) {
      expect(existsSync(path), `${path} must be committed`).toBe(true);
    }
  });

  it("separates implemented behavior from planned or external evidence", () => {
    for (const path of ["docs/PRD.md", "docs/TRD.md", "ARCHITECTURE.md"] as const) {
      const document = requiredDocument(path);
      expect(document).toContain("Implemented");
      expect(document).toContain("Planned");
      expect(document).toContain("External evidence");
    }
  });

  it("documents evidence authorities, autonomous continuation, and conceptual persistence", () => {
    const architecture = requiredDocument("ARCHITECTURE.md");
    const uml = requiredDocument("docs/UML.md");
    const erd = requiredDocument("docs/ERD.md");
    const traceability = requiredDocument("docs/TRACEABILITY.md");

    for (const phrase of [
      "check runs",
      "commit statuses",
      "formal reviews",
      "model judgement",
      "merge authority",
      "release acceptance",
      "deployment authority",
    ]) {
      expect(architecture.toLowerCase()).toContain(phrase);
    }

    expect(uml).toContain("stateDiagram-v2");
    expect(uml).toContain("sequenceDiagram");
    expect(erd).toContain("Conceptual model");
    expect(erd).toContain("writer_lease");
    expect(erd).toContain("operational_acceptance");
    expect(traceability).toContain("RCA → feasibility → action → proof");
    expect(traceability).toContain("No early stop");
  });
});
