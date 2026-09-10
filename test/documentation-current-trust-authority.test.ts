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
    const operability = readFileSync("docs/OPERABILITY.md", "utf8");
    const testStrategy = readFileSync("docs/TEST_STRATEGY.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(architecture).toContain("### 4.1 Protected procedural graph guidance");
    expect(architecture).not.toContain("Active PR #585 adds");
    expect(prd).toContain("Protected `main` includes a bounded **procedural graph advisory runtime** inside Agent Runtime.");
    expect(prd).not.toContain("Active PR #585 proposes");
    expect(trd).toContain("### 2.4 Protected procedural graph advisory runtime");
    expect(trd).not.toContain("Active PR #585 adds");
    expect(operability).not.toContain("Active #585 procedural graph source");
    expect(testStrategy).not.toContain("The #585 procedural graph slice is library-only");
    expect(baseline).toContain("## Protected procedural graph advisory source — issue #584 / merged #585 + #586");
    expect(baseline).not.toContain("## Active procedural graph advisory candidate — issue #584 / PR #585");
  });
});
