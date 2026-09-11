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
    expect(baseline).toMatch(
      /Dated central control-plane observation for this repair는 central `\.github\/main@[0-9a-f]{40}`/,
    );
    expect(baseline).not.toContain("Moving central control-plane snapshot은 central");
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
    expect(adoption).toContain("[current-state ACL #589]");
    expect(adoption).toContain("[Policy / Approval CAS #601]");
  });

  it("records merged procedural source separately from rollout acceptance", () => {
    const adoption = readFileSync("docs/doctoring/procedural_graph_adoption.md", "utf8");

    expect(adoption).toContain(
      "Protected source integration: #585, #586, and #589 are merged on protected `main`;",
    );
    expect(adoption).toContain(
      "#597 is merged on protected `main` as the State / Checkpoint durable-history slice;",
    );
    expect(adoption).toContain(
      "#601 is merged on protected `main` as the Noema Policy / Approval CAS slice.",
    );
    expect(adoption).not.toContain(
      "Noema: complete #585 and #586, preserve parent-first ancestry and existing runtime boundaries.",
    );
    expect(adoption).toContain("activationAuthorized:false");
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
    expect(architecture).toContain("bounded durable evaluation/rejection history");
    expect(architecture).not.toContain("protected procedural-graph source itself remains intentionally non-durable");

    expect(prd).toContain("Protected `main` includes a bounded **procedural graph advisory runtime** inside Agent Runtime.");
    expect(prd).not.toContain("Active PR #585 proposes");
    expect(prd).toContain("bounded durable evaluation/rejection history");
    expect(prd).toContain("separately authenticated signed evaluator-handoff verifier");
    expect(prd).not.toContain("graph/evaluation slice is intentionally non-durable");
    expect(prd).not.toContain("authenticated evaluation evidence, Policy / Approval, durable graph/rejection history");

    expect(trd).toContain("### 2.4 Protected procedural graph advisory runtime");
    expect(trd).not.toContain("Active PR #585 adds");
    expect(trd).not.toContain("## Candidate implementation — PR #585");
    expect(trd).toContain("bounded durable evaluation/rejection history");
    expect(trd).not.toContain("protected procedural graph source is intentionally non-durable");

    expect(uml).toContain("### 2.2 Protected procedural graph session, screening, and lifecycle projection");
    expect(uml).not.toContain("procedural graph advisory\\ncandidate PR 585");
    expect(uml).not.toContain("LIFE -. caller-supplied fresh authenticated lifecycle snapshot .-> PROC");
    expect(uml).toContain("Agent Runtime boundary가 만든 fresh authenticated `ExecutionLifecycle` snapshot");

    expect(operability).not.toContain("Active #585 procedural graph source");
    expect(operability).not.toContain("The #585 procedural graph candidate adds");
    expect(testStrategy).not.toContain("The #585 procedural graph slice is library-only");
    expect(testStrategy).not.toContain("The active procedural-graph candidate is intentionally **not** a stateful component");
    expect(testStrategy).toContain("## 14. Credential-exchange coverage truth");
    expect(testStrategy).toContain("test-first implement the smallest source fix");
    expect(testStrategy).toContain("if the item is waiting, rotate to other safe work");

    expect(traceability).toContain("bounded durable evaluation/rejection history");
    expect(traceability).not.toContain("Implemented on protected main as advisory-only/non-durable source");
    expect(traceability).not.toContain("The first six steps are Noema Agent Runtime mechanics in the active #585 candidate");
    expect(traceability).not.toContain("They do not authenticate the evaluator");
    expect(traceability).toContain("Protected signed-handoff verification authenticates the supplied evaluator assertion");

    expect(baseline).toContain("## Protected procedural graph advisory source — issue #584 / merged #585 + #586 + #589 + #597");
    expect(baseline).not.toContain("## Active procedural graph advisory candidate — issue #584 / PR #585");
    expect(baseline).toContain("bounded durable evaluation/rejection history");
    expect(baseline).toContain("ADR 0017도 `Proposed`다.");
  });

  it("converges canonical procedural authority after protected #601 without promoting activation", () => {
    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    const prd = readFileSync("docs/PRD.md", "utf8");
    const trd = readFileSync("docs/TRD.md", "utf8");
    const operability = readFileSync("docs/OPERABILITY.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const currentDocument of [architecture, prd, trd, operability, traceability, baseline]) {
      expect(currentDocument).toContain("#601");
    }

    expect(architecture).toContain("Policy / Approval CAS");
    expect(prd).toContain("Policy / Approval CAS");
    expect(trd).toContain("Policy / Approval CAS");
    expect(operability).toContain("Policy / Approval CAS");
    expect(traceability).toContain("Policy / Approval CAS");
    expect(baseline).toContain("Policy / Approval CAS");

    expect(baseline).not.toContain("Policy / Approval CAS, deployed Durable Object compatibility/p95/recovery");
    expect(baseline).not.toContain("Policy / Approval CAS tied to exact graph/evaluation/authenticated signed-claim/history identities");
    expect(operability).not.toContain("current-lifecycle revocation, Policy / Approval CAS, canary/rollback operation");
  });

  it("keeps trusted research adapter source separate from live producer completion", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const currentDocument of [changelog, baseline]) {
      expect(currentDocument).toContain("trusted-research-retrieval@v1");
      expect(currentDocument).toContain("live trusted retrieval producer");
      expect(currentDocument).toContain("immutable Noema release");
      expect(currentDocument).toContain("released central consumer");
    }

    expect(changelog).toContain("excerpt가 retrieved bytes 안에 verbatim으로 존재할 때만");
    expect(baseline).toContain("excerpt occurs verbatim in the retrieved bytes");
    expect(baseline).toContain("live producer/wiring/release/consumer open");
    expect(baseline).not.toContain("trusted research producer integrated");
  });
});
