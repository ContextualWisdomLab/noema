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
  "docs/adr/0010-private-target-review-auth.md",
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
    expect(index).toContain("[Licensing and IP transfer](./LICENSING_AND_IP_TRANSFER.md)");
  });

  it("separates shipped behavior, planned work, and external evidence", () => {
    for (const path of ["docs/PRD.md", "docs/TRD.md"] as const) {
      const document = requiredDocument(path);
      expect(document).toContain("Implemented");
      expect(document).toContain("Planned");
      expect(document).toContain("External evidence");
    }
  });

  it("does not present an unmerged architecture document as protected-main truth", () => {
    const architecture = requiredDocument("ARCHITECTURE.md");

    expect(architecture).toContain("Proposed canonical architecture");
    expect(architecture).toContain("In review on PR #71");
    expect(architecture).not.toContain("현재 `main` 기준 권위 있는 시스템 아키텍처");
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
    const trd = requiredDocument("docs/TRD.md");
    const decision = requiredDocument("docs/adr/0002-work-conserving-autonomy.md");
    const traceability = requiredDocument("docs/TRACEABILITY.md");
    const gapAudit = requiredDocument("docs/DOCUMENTATION_GAP_AUDIT.md");

    expect(prd).toContain("FR-019");
    expect(prd).toContain("intermediate artifact");
    expect(trd).toContain("### 9.1 Deliverable handoff state machine");
    for (const phrase of [
      "prompt update → repository-consumed policy and executable contract",
      "RCA → feasible action",
      "design → implementation",
      "test → production code",
      "documentation assessment → canonical repository files",
      "pull request → exact-head checks → review remediation → protected merge",
      "protected merge → protected-main operational acceptance",
      "double exit sweep",
    ]) {
      expect(trd).toContain(phrase);
    }
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

  it("keeps private-target review bootstrap repository-scoped and fail closed", () => {
    const index = requiredDocument("docs/adr/README.md");
    const decision = requiredDocument("docs/adr/0010-private-target-review-auth.md");
    const traceability = requiredDocument("docs/TRACEABILITY.md");

    expect(index).toContain("[0010](./0010-private-target-review-auth.md) | Proposed");
    for (const phrase of [
      "repository-scoped Noema App token",
      "first live target PR lookup",
      "`GITHUB_TOKEN`",
      "private target repository",
      "least privilege",
      "fail closed",
    ]) {
      expect(decision).toContain(phrase);
    }
    expect(traceability).toContain("ADR-0010");
    expect(traceability).toContain("private target repository");
  });

  it("keeps licensing, third-party obligations, and transfer authority fail closed", () => {
    const licensing = requiredDocument("docs/LICENSING_AND_IP_TRANSFER.md");

    for (const phrase of [
      "Public source availability is not a grant of rights",
      "owner/legal",
      "package.json",
      "SEE LICENSE IN",
      "UNLICENSED",
      "SPDX",
      "SBOM",
      "NOTICE",
      "contributor",
      "assignment",
      "transfer-evidence.json",
      "OCI image license metadata",
      "must remain absent",
      "fail closed",
    ]) {
      expect(licensing).toContain(phrase);
    }
  });

  it("records the canonical documentation baseline and handoff contract in the changelog", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");

    expect(changelog).toContain("canonical documentation graph");
    expect(changelog).toContain("PRD·TRD·ADR·UML·ERD");
    expect(changelog).toContain("FR-019 deliverable handoff");
    expect(changelog).toContain("documentation repair is intermediate");
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

  it("keeps runner assignment observability separate from workflow conclusions", () => {
    const trd = requiredDocument("docs/TRD.md");
    const uml = requiredDocument("docs/UML.md");
    const erd = requiredDocument("docs/ERD.md");
    const traceability = requiredDocument("docs/TRACEABILITY.md");
    const gapAudit = requiredDocument("docs/DOCUMENTATION_GAP_AUDIT.md");

    expect(trd.toLowerCase()).toContain("runner assignment");
    expect(uml.toLowerCase()).toContain("runner assignment");
    expect(erd).toContain("runner_assignment_evidence");
    expect(traceability).toContain("PR #88");
    expect(traceability.toLowerCase()).toContain("runner assignment");
    expect(gapAudit).toContain("PR #88");
    expect(gapAudit.toLowerCase()).toContain("runner assignment");
  });
});
