import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("canonical active-work documentation", () => {
  it("tracks only current material owners instead of reviving closed predecessor PRs", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const licensing = readFileSync("docs/LICENSING_AND_IP_TRANSFER.md", "utf8");

    for (const currentOwner of ["PR #71", "PR #407", "PR #67"]) {
      expect(gapAudit).toContain(currentOwner);
      expect(traceability).toContain(currentOwner);
    }

    for (const historicalOwner of ["PR #90", "PR #91", "PR #92", "PR #93", "PR #94", "PR #95", "PR #97", "PR #99"]) {
      expect(gapAudit).not.toContain(historicalOwner);
    }

    expect(traceability).toContain("Historical PR numbers are deliberately omitted");
    expect(traceability).not.toContain("Governance observed-vs-target evidence | issue #27 / PR #412");
    expect(traceability).not.toContain("Buyer/operator root README | PR #413");
    expect(licensing).toContain("Protected source implements an exact-release rights receipt named `artifact_rights_metadata`");
    expect(licensing).toContain("already integrated on protected main");
    expect(licensing).not.toContain("PR #69 remains active-PR technical evidence");
    expect(licensing).not.toContain("PR #69 actively authenticates");
    expect(licensing).toContain("duplicate");
    expect(licensing).toContain("UTF-8");
  });

  it("keeps the PRD aligned to the current protected trust contract and open owner set", () => {
    const prd = readFileSync("docs/PRD.md", "utf8");

    expect(prd).toContain("exact full workflow ref");
    expect(prd).toContain("stronger immutable workflow-source binding is not implemented on protected main");
    expect(prd).toContain("**PR #71**");
    expect(prd).toContain("**PR #407**");
    expect(prd).toContain("**PR #67**");
    expect(prd).not.toContain("**PR #412**");
    expect(prd).not.toContain("**PR #413**");
    expect(prd).toContain("issue #84 source repair is protected truth");

    for (const staleActiveOwner of ["PR #80", "PR #83", "PR #86", "PR #90", "PR #91", "PR #92", "PR #93", "PR #94", "PR #69", "PR #72"]) {
      expect(prd).not.toContain(staleActiveOwner);
    }
    expect(prd).not.toContain("paired immutable workflow SHA");
    expect(prd).not.toContain("job_workflow_sha");
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
    expect(index).toContain("[OpenAPI 3.1](../openapi.json)");
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
    expect(gapAudit).toMatch(/Protected `main` observed:\*\* `?[0-9a-f]{40}`?/);
    expect(gapAudit).toContain("source defect itself is no longer an open implementation gap");
    expect(gapAudit).not.toContain("Direct-main dependent PRs remain blocked by protected-main audit until it integrates");
  });
});
