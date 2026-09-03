import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("canonical active-work documentation", () => {
  it("tracks durable current owners instead of reviving integrated predecessor PRs", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const licensing = readFileSync("docs/LICENSING_AND_IP_TRANSFER.md", "utf8");

    for (const currentOwner of ["issue #27", "issue #66", "issue #3", "issue #5"]) {
      expect(gapAudit).toContain(currentOwner);
      expect(traceability).toContain(currentOwner);
    }

    for (const historicalOwner of ["PR #67", "PR #71", "PR #90", "PR #91", "PR #92", "PR #93", "PR #94", "PR #95", "PR #97", "PR #99", "PR #407", "Active PR #426"]) {
      expect(gapAudit).not.toContain(historicalOwner);
      expect(traceability).not.toContain(historicalOwner);
    }

    expect(traceability).toContain("Historical or integrated PR numbers are deliberately omitted");
    expect(traceability).not.toContain("Governance observed-vs-target evidence | issue #27 / PR #412");
    expect(traceability).not.toContain("Buyer/operator root README | PR #413");
    expect(licensing).toContain("Protected source implements an exact-release rights receipt named `artifact_rights_metadata`");
    expect(licensing).toContain("already integrated on protected main");
    expect(licensing).not.toContain("PR #69 remains active-PR technical evidence");
    expect(licensing).not.toContain("PR #69 actively authenticates");
    expect(licensing).toContain("duplicate");
    expect(licensing).toContain("UTF-8");
  });

  it("keeps the PRD aligned to immutable workflow-source trust and integrated validator supply chain", () => {
    const prd = readFileSync("docs/PRD.md", "utf8");

    expect(prd).toContain("exact full workflow ref");
    expect(prd).toContain("immutable `ALLOWED_WORKFLOW_SHA` trust");
    expect(prd).toContain("job_workflow_sha");
    expect(prd).toContain("issue #66");
    expect(prd).not.toContain("**PR #407**");
    expect(prd).not.toContain("**PR #67**");
    expect(prd).not.toContain("**PR #71**");
    expect(prd).not.toContain("**PR #412**");
    expect(prd).not.toContain("**PR #413**");
    expect(prd).toContain("issue #84 source repair is protected truth");

    for (const staleActiveOwner of ["PR #80", "PR #83", "PR #86", "PR #90", "PR #91", "PR #92", "PR #93", "PR #94", "PR #69", "PR #72"]) {
      expect(prd).not.toContain(staleActiveOwner);
    }
    expect(prd).not.toContain("stronger immutable workflow-source binding is not implemented on protected main");
  });

  it("does not describe the integrated #528 runtime foundation as candidate active-PR truth", () => {
    const prd = readFileSync("docs/PRD.md", "utf8");
    const contextMap = readFileSync("docs/CONTEXT_MAP.md", "utf8");
    const adr = readFileSync("docs/adr/0012-runtime-orchestration-bounded-contexts.md", "utf8");

    expect(prd).not.toContain("On PR #528 this mode is **candidate truth only** until protected integration");
    expect(contextMap).not.toContain("PR #528 now carries a candidate bounded task-plan admission and runnable-task selector");
    expect(contextMap).not.toContain("PR #528 currently carries candidate checkpoint admission");
    expect(adr).not.toContain("The first candidate runtime code in PR #528 introduces");
    expect(adr).not.toContain("Until this ADR and code integrate into protected `main`, they remain candidate truth");

    expect(prd).toContain("Protected `main` includes the Agent Runtime lifecycle and State / Checkpoint admission foundation");
    expect(contextMap).toContain("Protected `main` includes bounded task-plan admission and runnable-task selection");
    expect(adr).toContain("The protected runtime foundation introduced by PR #528 includes");
  });

  it("keeps the product-technical baseline on current protected and active owner truth", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("`main@bbee33270b496255d785c766fc009a5f9162a695`");
    expect(baseline).toContain("Apache-2.0 source grant | protected main");
    expect(baseline).toContain("issue #531 / PR #540");
    expect(baseline).toContain("issue #541 / PR #542");
    expect(baseline).toContain("PR #546");
    expect(baseline).not.toContain("README/license candidate truth is PR #530");
    expect(baseline).not.toContain("PR #530 is open");
    expect(baseline).not.toContain("Apache-2.0 candidate truth on #530");
    expect(baseline).not.toContain("P1 | Apache-2.0 source grant integration");
  });

  it("keeps the licensing authority aligned with merged #530 protected truth", () => {
    const licensing = readFileSync("docs/LICENSING_AND_IP_TRANSFER.md", "utf8");

    expect(licensing).toContain("Protected `main` carries the owner-selected Apache-2.0 source grant");
    expect(licensing).toContain("issue #531 / PR #540");
    expect(licensing).not.toContain("source-license decision is Apache-2.0 on PR #530 until protected integration");
    expect(licensing).not.toContain("Until that exact head integrates, protected `main` remains the currently shipped source-rights authority");
    expect(licensing).not.toContain("Protected `main@03ef2301bad020b9ab4dfde2ec3c4e7f460024ca` still has no root `LICENSE`");
    expect(licensing).not.toContain("Those declarations are candidate truth until #530 integrates");
  });

  it("records the code-current canonical graph and protected credential-coverage closure", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");

    expect(gapAudit).toContain("Canonical architecture/documentation | current repository revision");
    expect(traceability).toContain("Canonical documentation graph | this repository revision");
    expect(traceability).toContain("Credential/security coverage truth | protected main");
    expect(traceability).not.toContain("Issue #84 remains open");
  });

  it("records the closed credential-source policy repair without inventing external App evidence", () => {
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const prd = readFileSync("docs/PRD.md", "utf8");
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");

    for (const document of [traceability, prd, gapAudit]) {
      expect(document).not.toContain("Issue #111 remains open");
      expect(document).not.toContain("issue #111's KV-only governance reconciliation remains open");
      expect(document).toContain("#29");
      expect(document).toContain("#227");
    }
    expect(traceability).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
    expect(traceability).toContain("capability file");
    expect(traceability).toContain("0600");
    expect(traceability).toContain("symlink");
    expect(traceability).toContain("ambient");
    expect(traceability).not.toContain("later scripts receive the Maintainer App token through `GH_TOKEN`");
    expect(traceability).toContain("Issue #111 is closed");
    expect(prd).toContain("Issue #111 is closed");
    expect(gapAudit).toContain("issue #111 is closed");
  });

  it("tracks the protected OpenAPI contract without promoting historical PR ownership", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const index = readFileSync("docs/README.md", "utf8");

    expect(gapAudit).toContain("OpenAPI 3.1");
    expect(gapAudit).toContain("protected");
    expect(traceability).toContain("openapi.json");
    expect(traceability).toContain("Implemented on protected main");
    expect(index).toContain("protected HTTP API machine contract");
    expect(index).not.toContain("PR #99");
  });

  it("keeps transient check state observation-scoped instead of timeless", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");

    expect(gapAudit).toContain("Every run must refetch these identities");
    expect(gapAudit).toContain("This table is navigation, not immutable authority");
    expect(traceability).toContain("Transient queue/green states belong to observation-scoped evidence");
    expect(traceability).toContain("keep transient check conclusions out of timeless claims unless explicitly observation-scoped");
  });

  it("separates design sufficiency from protected-main operational acceptance", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");

    expect(gapAudit).toContain("DESIGN_SUFFICIENT");
    expect(gapAudit).toContain("PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT");
    expect(gapAudit).toMatch(/Protected `main` branch-point observed:\*\* `?[0-9a-f]{40}`?/);
    expect(gapAudit).toContain("source defect itself is no longer an open implementation gap");
    expect(gapAudit).not.toContain("Direct-main dependent PRs remain blocked by protected-main audit until it integrates");
  });

  it("does not teach contributors that credential-core V8 exclusions are deliberate", () => {
    const claude = readFileSync("CLAUDE.md", "utf8");

    expect(claude).not.toContain("`/* v8 ignore */` markers in `src/index.ts` are deliberate");
    expect(claude).toContain("docs/TEST_STRATEGY.md");
    expect(claude).toContain("broad credential/security V8 exclusions are regressions");
  });

  it("keeps contributor architecture guidance aligned with the deployed runtime entrypoint", () => {
    const claude = readFileSync("CLAUDE.md", "utf8");
    const wrangler = readFileSync("wrangler.toml", "utf8");

    expect(wrangler).toContain('main = "src/runtime-entrypoint.ts"');
    expect(claude).toContain("`src/runtime-entrypoint.ts`");
    expect(claude).toContain("NoemaRateLimiter");
    expect(claude).toContain("NoemaOidcReplayGuard");
    expect(claude).not.toContain("The entire Worker is one file: **`src/index.ts`**");
    expect(claude).not.toContain("There are no KV/D1/queue/Durable Object bindings");
  });
});
