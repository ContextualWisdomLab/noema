import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredDocuments = [
  "docs/README.md",
  "docs/PRD.md",
  "docs/TRD.md",
  "ARCHITECTURE.md",
  "docs/adr/README.md",
  "docs/adr/0001-evidence-authority-separation.md",
  "docs/adr/0002-work-conserving-autonomy.md",
  "docs/adr/0003-exact-revision-and-live-base.md",
  "docs/adr/0004-safe-repository-writes.md",
  "docs/adr/0005-fail-closed-untrusted-materialization.md",
  "docs/adr/0006-protected-main-operational-acceptance.md",
  "docs/adr/0007-package-manager-reproducibility.md",
  "docs/adr/0008-atomic-proposal-publication.md",
  "docs/adr/0009-central-local-automation-ownership.md",
  "docs/UML.md",
  "docs/ERD.md",
  "docs/TRACEABILITY.md",
  "docs/TEST_STRATEGY.md",
  "docs/OPERABILITY.md",
  "docs/threat-model.md",
  "docs/automation-threat-model.md",
  "docs/DOCUMENTATION_GAP_AUDIT.md",
] as const;

/** Read a required architecture document after proving it is committed. */
function requiredDocument(path: (typeof requiredDocuments)[number]): string {
  expect(existsSync(path), `${path} must be committed`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("authoritative Noema documentation graph", () => {
  it("keeps product, technical, decision, model, security, and operations documents discoverable", () => {
    for (const path of requiredDocuments) {
      expect(existsSync(path), `${path} must be committed`).toBe(true);
    }
    const index = requiredDocument("docs/README.md");
    expect(index).toContain("[Automation threat model](./automation-threat-model.md)");
  });

  it("separates shipped behavior, planned work, and external evidence", () => {
    for (const path of ["docs/PRD.md", "docs/TRD.md"] as const) {
      const document = requiredDocument(path);
      expect(document).toContain("Implemented");
      expect(document).toContain("Planned");
      expect(document).toContain("External evidence");
    }
  });

  it("documents evidence authorities, continuation, conceptual persistence, and residual gaps", () => {
    const architecture = requiredDocument("ARCHITECTURE.md");
    const uml = requiredDocument("docs/UML.md");
    const erd = requiredDocument("docs/ERD.md");
    const traceability = requiredDocument("docs/TRACEABILITY.md");
    const automationThreatModel = requiredDocument("docs/automation-threat-model.md");
    const gapAudit = requiredDocument("docs/DOCUMENTATION_GAP_AUDIT.md");

    for (const phrase of [
      "check runs",
      "commit statuses",
      "review evidence",
      "model judgement",
      "merge authority",
      "release authority",
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
    expect(automationThreatModel).toContain("Repair-workflow privilege escalation");
    expect(automationThreatModel).toContain("Model-to-write credential crossing");
    expect(gapAudit).toContain("## Baseline verdict");
    expect(gapAudit).toContain("## Remaining gaps");
    expect(gapAudit).toContain("Protected-main acceptance");
  });

  it("requires every intermediate artifact to continue into the next executable boundary", () => {
    const prd = requiredDocument("docs/PRD.md");
    const decision = requiredDocument("docs/adr/0002-work-conserving-autonomy.md");
    const traceability = requiredDocument("docs/TRACEABILITY.md");
    const gapAudit = requiredDocument("docs/DOCUMENTATION_GAP_AUDIT.md");

    expect(prd).toContain("FR-019");
    expect(prd).toContain("intermediate artifact");
    expect(decision).toContain("## Deliverable handoff invariant");
    for (const phrase of [
      "prompt update",
      "RCA → feasible action",
      "design → implementation",
      "test → production code",
      "documentation assessment → canonical repository files",
      "pull request → exact-head checks → review remediation → protected merge",
      "protected merge → protected-main operational acceptance",
      "double exit sweep",
    ]) {
      expect(decision).toContain(phrase);
    }
    expect(traceability).toContain("FR-019 deliverable handoff");
    expect(gapAudit).toContain("documentation assessment must mutate GitHub state");
    expect(gapAudit).toContain("documentation repair is intermediate");
  });

  it("keeps the current replay side-effect limitation explicit until #81 is integrated", () => {
    const gapAudit = requiredDocument("docs/DOCUMENTATION_GAP_AUDIT.md");

    expect(gapAudit).toContain(
      "current ordering can detect a replay after GitHub installation-token creation",
    );
    expect(gapAudit).toContain("Issue #81");
    expect(gapAudit).toContain("before `createInstallationToken()`");
    expect(gapAudit).toContain(
      "after cryptographic OIDC and target authorization but before",
    );
  });
});
