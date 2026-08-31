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
  "docs/product-technical-gap-baseline.md",
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
    expect(index).toContain(
      "[Product and technical gap baseline](./product-technical-gap-baseline.md)",
    );
  });

  it("separates revision-local, protected, planned, and external evidence", () => {
    const architecture = document("ARCHITECTURE.md");
    const traceability = document("docs/TRACEABILITY.md");
    const gapAudit = document("docs/DOCUMENTATION_GAP_AUDIT.md");
    expect(architecture).toContain("Code-current canonical architecture");
    expect(architecture).toContain("active PR head");
    expect(architecture).toContain(
      "candidate truth until that revision integrates",
    );
    expect(traceability).toContain("Implemented on protected main");
    expect(traceability).toContain("Implemented on active PR / In review");
    expect(traceability).toContain("Planned");
    expect(traceability).toContain("External evidence");
    expect(gapAudit).toContain(
      "PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT: FAIL CLOSED",
    );
  });

  it("keeps evidence authorities and durable current owners explicit", () => {
    const architecture = document("ARCHITECTURE.md");
    const traceability = document("docs/TRACEABILITY.md");
    const gapAudit = document("docs/DOCUMENTATION_GAP_AUDIT.md");
    const productGap = document("docs/product-technical-gap-baseline.md");
    for (const phrase of [
      "check runs",
      "commit statuses",
      "review evidence",
      "model judgement",
      "merge authority",
      "release authority",
      "deployment authority",
    ]) {
      expect(architecture).toContain(phrase);
    }
    expect(traceability).toContain("RCA → feasibility → action → proof");
    expect(traceability).toContain("A blocked lane is local");
    for (const owner of ["issue #27", "issue #66", "issue #3", "issue #5"]) {
      expect(gapAudit).toContain(owner);
      expect(productGap).toContain(owner);
    }
    expect(productGap).toContain(
      "| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |",
    );
    expect(productGap).toContain("issues #29 / #227");
    for (const staleOwner of ["PR #407", "PR #67", "Active PR #426"]) {
      expect(gapAudit).not.toContain(staleOwner);
      expect(traceability).not.toContain(staleOwner);
      expect(productGap).not.toContain(staleOwner);
    }
    const currentStatusDocuments = [
      "docs/TRD.md",
      "docs/adr/0002-work-conserving-autonomy.md",
      "docs/adr/0003-exact-revision-and-live-base.md",
      "docs/adr/0004-safe-repository-writes.md",
      "docs/adr/0005-fail-closed-untrusted-materialization.md",
      "docs/adr/0007-package-manager-reproducibility.md",
      "docs/adr/0008-atomic-proposal-publication.md",
      "docs/adr/0009-central-local-automation-ownership.md",
      "docs/adr/0010-private-target-review-auth.md",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const staleStatus of [
      "PR #71에서 검토 중",
      "PR #88이 이 read-only",
      "PR #80의 atomic publisher",
      "PR #76과 #78이 이 영역",
      "PR #71 branch",
      "PR #78 is the active implementation",
      "Implementation owner:** PR #80",
      "Related implementation:** PR #85",
      "tests on PR #69",
      "boundary on PR #65",
      "evidence work on PR #67",
      "PR #80 stacked Security Scan trigger RCA",
    ]) {
      expect(currentStatusDocuments).not.toContain(staleStatus);
    }
    expect(currentStatusDocuments).toContain("`docs/PRD.md` FR-016 and FR-017");
    expect(currentStatusDocuments).not.toContain("FR-019");
  });

  it("keeps immutable workflow-source trust separate from revision-local canonical-byte hardening", () => {
    const architecture = document("ARCHITECTURE.md");
    const traceability = document("docs/TRACEABILITY.md");
    expect(architecture).toContain("exact full workflow ref");
    expect(architecture).toContain("`ALLOWED_WORKFLOW_SHA`");
    expect(architecture).toContain("operator authority bytes");
    expect(traceability).toContain(
      "Immutable source binding is implemented on protected main",
    );
    expect(traceability).toContain("canonical operator bytes");
  });

  it("keeps licensing and issue-84 closure fail closed", () => {
    const licensing = document("docs/LICENSING_AND_IP_TRANSFER.md");
    const gapAudit = document("docs/DOCUMENTATION_GAP_AUDIT.md");
    const traceability = document("docs/TRACEABILITY.md");
    for (const phrase of [
      "Public source availability is not a grant of rights",
      "owner/legal",
      "SBOM",
      "NOTICE",
      "artifact_rights_metadata",
      "fail closed",
    ]) {
      expect(licensing).toContain(phrase);
    }
    expect(gapAudit).toContain(
      "source defect itself is no longer an open implementation gap",
    );
    expect(traceability).toContain("broad V8-ignore introduction = regression");
  });
});
