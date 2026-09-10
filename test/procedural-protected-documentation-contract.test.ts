import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const document = (path: string): string => readFileSync(path, "utf8");

describe("protected procedural documentation authority", () => {
  it("classifies the merged workflow-backed current-state ACL as protected source", () => {
    const architecture = document("ARCHITECTURE.md");
    const prd = document("docs/PRD.md");
    const trd = document("docs/TRD.md");
    const baseline = document("docs/product-technical-gap-baseline.md");
    const adoption = document("docs/doctoring/procedural_graph_adoption.md");

    for (const currentDocument of [architecture, prd, trd, baseline, adoption]) {
      expect(currentDocument).not.toContain("On this active branch");
      expect(currentDocument).not.toContain("Draft #589");
      expect(currentDocument).not.toContain("candidate #589");
      expect(currentDocument).not.toContain("tracked in #589 until its own protected integration");
    }

    expect(architecture).toContain("Protected source `src/agent-runtime/procedural-current-lifecycle.ts`");
    expect(prd).toContain("Protected source includes the #589 workflow-backed current-state ACL");
    expect(trd).toContain("Protected source reuses the Workflow / Task Execution Durable Object only as current task/cancellation evidence for procedural guidance");
    expect(baseline).toContain("protected #585/#586/#589");
    expect(adoption).toContain("#585, #586, and #589 are merged on protected `main`");
  });

  it("classifies durable procedural evaluation history as protected State / Checkpoint source", () => {
    const adoption = document("docs/doctoring/procedural_graph_adoption.md");

    expect(adoption).toContain("#597 is merged on protected `main`");
    expect(adoption).toContain("bounded durable evaluation/rejection history");
    expect(adoption).toContain("Policy / Approval CAS promotion/revocation remains separate authority");
    expect(adoption).not.toContain("Reuse existing execution/state authorities before adding persistence");
    expect(adoption).not.toContain("There is no production graph/trajectory store, signed receipt verifier");
  });

  it("keeps ADR-0017 aligned with protected signed-evaluation and State / Checkpoint authority", () => {
    const adr = document("docs/adr/0017-procedural-graph-guidance.md");

    expect(adr).toContain("Protected #597 adds bounded durable evaluation/rejection history");
    expect(adr).toContain("Protected #599 adds a provenance-preserving verified read boundary");
    expect(adr).toContain("Policy / Approval CAS promotion/revocation remains separate authority");
    expect(adr).not.toContain("later State/Checkpoint adapter owns authenticated retention");
    expect(adr).not.toContain("durable graph/rejection history and promotion/revocation remain separate work");
    expect(adr).not.toContain("There is still no production graph/trajectory store, signed receipt verifier");
  });

  it("classifies procedural Policy / Approval CAS as protected source without granting activation", () => {
    const adoption = document("docs/doctoring/procedural_graph_adoption.md");
    const adr = document("docs/adr/0017-procedural-graph-guidance.md");

    for (const currentDocument of [adoption, adr]) {
      expect(currentDocument).toContain("#601");
      expect(currentDocument).toContain("Policy / Approval");
      expect(currentDocument).toContain("activationAuthorized:false");
      expect(currentDocument).not.toContain("independently approved graph promotion/revocation API");
      expect(currentDocument).not.toContain("independently approved promotion API");
    }

    expect(adoption).toContain("#601 is merged on protected `main`");
    expect(adoption).toContain("monotonic approval-version CAS");
    expect(adoption).toContain("explicit revocation");
    expect(adr).toContain("Protected #601 adds the Noema Policy / Approval CAS boundary");
  });
});
