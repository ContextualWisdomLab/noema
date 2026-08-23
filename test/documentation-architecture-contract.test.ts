import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredDocuments = [
  "docs/README.md",
  "docs/PRD.md",
  "docs/TRD.md",
  "ARCHITECTURE.md",
  "docs/adr/README.md",
  "docs/adr/0011-independent-reviewer-governance.md",
  "docs/UML.md",
  "docs/ERD.md",
  "docs/TRACEABILITY.md",
  "docs/TEST_STRATEGY.md",
  "docs/OPERABILITY.md",
  "docs/LICENSING_AND_IP_TRANSFER.md",
  "docs/threat-model.md",
  "docs/automation-threat-model.md",
  "docs/DOCUMENTATION_GAP_AUDIT.md",
] as const;

function document(path: (typeof requiredDocuments)[number]): string {
  expect(existsSync(path), `${path} must be committed`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("authoritative Noema documentation graph", () => {
  it("keeps the canonical graph discoverable", () => {
    for (const path of requiredDocuments) expect(existsSync(path)).toBe(true);
    const index = document("docs/README.md");
    expect(index).toContain("[Architecture](../ARCHITECTURE.md)");
    expect(index).toContain("[Test Strategy](./TEST_STRATEGY.md)");
    expect(index).toContain("[Operability](./OPERABILITY.md)");
    expect(index).toContain("[OpenAPI 3.1](../openapi.json)");
  });

  it("separates revision-local, protected, planned, and external evidence", () => {
    const architecture = document("ARCHITECTURE.md");
    const traceability = document("docs/TRACEABILITY.md");
    const gapAudit = document("docs/DOCUMENTATION_GAP_AUDIT.md");
    expect(architecture).toContain("Code-current canonical architecture");
    expect(architecture).toContain("active PR head");
    expect(architecture).toContain("candidate truth until that revision integrates");
    expect(traceability).toContain("Implemented on protected main");
    expect(traceability).toContain("Implemented on active PR / In review");
    expect(traceability).toContain("Planned");
    expect(traceability).toContain("External evidence");
    expect(gapAudit).toContain("PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT: FAIL CLOSED");
  });

  it("keeps evidence authorities and durable current owners explicit", () => {
    const architecture = document("ARCHITECTURE.md");
    const traceability = document("docs/TRACEABILITY.md");
    const gapAudit = document("docs/DOCUMENTATION_GAP_AUDIT.md");
    for (const phrase of ["check runs", "commit statuses", "review evidence", "model judgement", "merge authority", "release authority", "deployment authority"]) {
      expect(architecture).toContain(phrase);
    }
    expect(traceability).toContain("RCA → feasibility → action → proof");
    expect(traceability).toContain("A blocked lane is local");
    for (const owner of ["issue #27", "issue #66", "issue #3", "issue #5"]) {
      expect(gapAudit).toContain(owner);
    }
    for (const staleOwner of ["PR #407", "PR #67", "Active PR #426"]) {
      expect(gapAudit).not.toContain(staleOwner);
      expect(traceability).not.toContain(staleOwner);
    }
  });

  it("keeps immutable workflow-source trust separate from revision-local canonical-byte hardening", () => {
    const architecture = document("ARCHITECTURE.md");
    const traceability = document("docs/TRACEABILITY.md");
    expect(architecture).toContain("exact full workflow ref");
    expect(architecture).toContain("`ALLOWED_WORKFLOW_SHA`");
    expect(architecture).toContain("operator authority bytes");
    expect(traceability).toContain("Immutable source binding is implemented on protected main");
    expect(traceability).toContain("canonical operator bytes");
  });

  it("keeps licensing and issue-84 closure fail closed", () => {
    const licensing = document("docs/LICENSING_AND_IP_TRANSFER.md");
    const gapAudit = document("docs/DOCUMENTATION_GAP_AUDIT.md");
    const traceability = document("docs/TRACEABILITY.md");
    for (const phrase of ["Public source availability is not a grant of rights", "owner/legal", "SBOM", "NOTICE", "artifact_rights_metadata", "fail closed"]) {
      expect(licensing).toContain(phrase);
    }
    expect(gapAudit).toContain("source defect itself is no longer an open implementation gap");
    expect(traceability).toContain("broad V8-ignore introduction = regression");
  });
});
