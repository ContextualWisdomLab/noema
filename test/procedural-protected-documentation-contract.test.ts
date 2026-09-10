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
});
