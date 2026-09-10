import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("separates live current authority from dated source observations and immutable pins", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "Current protected source는 mutation·merge·release 시점에 live protected `main`을 다시 조회해 결정한다",
    );
    expect(baseline).toMatch(
      /Dated protected observation for this repair는 `main@[0-9a-f]{40}`/,
    );
    expect(baseline).toContain("merged PR #582 exact `0f20a4dc78e423fd5df49e137a4eb286c7075ea4`");
    expect(baseline).toContain("central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`");
    expect(baseline).toContain("`ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`");
    expect(baseline).toContain("Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며");
    expect(baseline).not.toMatch(
      /Current protected source는 GitHub-verified protected `main@[0-9a-f]{40}`/,
    );
    expect(baseline).not.toContain(
      "#559가 `docs/product-technical-gap-baseline.md`와 executable documentation-authority tests의 sole writer다",
    );
  });

  it("keeps the procedural adoption evidence referenced by the TRD inside the parent source", () => {
    const adoptionPath = "docs/doctoring/procedural_graph_adoption.md";
    const trd = readFileSync("docs/TRD.md", "utf8");

    expect(trd).toContain(`\`${adoptionPath}\``);
    expect(existsSync(adoptionPath)).toBe(true);

    const adoption = readFileSync(adoptionPath, "utf8");
    expect(adoption).toContain(
      "Status: Proposed implementation and rollout record, not release or deployment acceptance.",
    );
    expect(adoption).toContain("[lifecycle #586]");
  });

  it("records merged procedural source separately from rollout acceptance", () => {
    const adoption = readFileSync("docs/doctoring/procedural_graph_adoption.md", "utf8");

    expect(adoption).toContain(
      "Protected source integration: #585 and #586 are merged on protected `main`.",
    );
    expect(adoption).not.toContain(
      "Noema: complete #585 and #586, preserve parent-first ancestry and existing runtime boundaries.",
    );
    expect(adoption).toContain("activationAuthorized: false");
  });

  it("keeps canonical procedural documentation aligned with protected source integration", () => {
    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    const prd = readFileSync("docs/PRD.md", "utf8");
    const trd = readFileSync("docs/TRD.md", "utf8");
    const uml = readFileSync("docs/UML.md", "utf8");
    const operability = readFileSync("docs/OPERABILITY.md", "utf8");
    const testStrategy = readFileSync("docs/TEST_STRATEGY.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(architecture).toContain("### 4.1 Protected procedural graph guidance");
    expect(architecture).not.toContain("Active PR #585 adds");
    expect(prd).toContain("Protected `main` includes a bounded **procedural graph advisory runtime** inside Agent Runtime.");
    expect(prd).not.toContain("Active PR #585 proposes");
    expect(trd).toContain("### 2.4 Protected procedural graph advisory runtime");
    expect(trd).not.toContain("Active PR #585 adds");
    expect(trd).not.toContain("## Candidate implementation — PR #585");
    expect(uml).toContain("### 2.2 Protected procedural graph session, screening, and lifecycle projection");
    expect(uml).not.toContain("procedural graph advisory\\ncandidate PR 585");
    expect(uml).not.toContain("LIFE -. caller-supplied fresh authenticated lifecycle snapshot .-> PROC");
    expect(uml).toContain("Agent Runtime boundary가 만든 fresh authenticated `ExecutionLifecycle` snapshot");
    expect(operability).not.toContain("Active #585 procedural graph source");
    expect(operability).not.toContain("The #585 procedural graph candidate adds");
    expect(testStrategy).not.toContain("The #585 procedural graph slice is library-only");
    expect(testStrategy).not.toContain("The active procedural-graph candidate is intentionally **not** a stateful component");
    expect(traceability).toContain("Implemented on protected main as advisory-only/non-durable source");
    expect(traceability).not.toContain("The first six steps are Noema Agent Runtime mechanics in the active #585 candidate");
    expect(baseline).toContain("## Protected procedural graph advisory source — issue #584 / merged #585 + #586");
    expect(baseline).not.toContain("## Active procedural graph advisory candidate — issue #584 / PR #585");
    expect(baseline).toContain("ADR 0017도 `Proposed`다.");
  });
});
