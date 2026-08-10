import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("canonical active-work documentation", () => {
  it("tracks protected-main successors and exact-release rights evidence", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const licensing = readFileSync("docs/LICENSING_AND_IP_TRANSFER.md", "utf8");

    for (const currentOwner of ["PR #90", "PR #91", "PR #92", "PR #93", "PR #94", "PR #95", "PR #97", "PR #99"]) {
      expect(gapAudit).toContain(currentOwner);
    }
    expect(gapAudit).toContain("#76");
    expect(gapAudit.toLowerCase()).toContain("integrated");
    expect(gapAudit).toContain("#87");
    expect(gapAudit).toContain("#89");
    expect(gapAudit).toContain("#85");
    expect(gapAudit).toContain("#88");
    expect(gapAudit).toContain("#72");
    expect(gapAudit.toLowerCase()).toContain("superseded");

    expect(traceability).toContain("#27/#90");
    expect(traceability).toContain("#77/#91");
    expect(traceability).toContain("#29/#92");
    expect(traceability).toContain("#30 / PR #94");
    expect(traceability).toContain("#9/#93");
    expect(traceability).toContain("#73/#95");
    expect(traceability).toContain("#96/#97");

    expect(licensing).toContain("artifact_rights_metadata");
    expect(licensing).toContain("PR #69");
    expect(licensing).toContain("duplicate");
    expect(licensing).toContain("UTF-8");
    expect(traceability).toContain("artifact_rights_metadata");
  });

  it("tracks the machine-readable HTTP interoperability contract without promoting active PR behavior to protected truth", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const index = readFileSync("docs/README.md", "utf8");

    expect(gapAudit).toContain("PR #99");
    expect(gapAudit).toContain("OpenAPI 3.1");
    expect(gapAudit).toContain("Proposed/In review");
    expect(traceability).toContain("PR #99");
    expect(traceability).toContain("openapi.json");
    expect(index).toContain("../openapi.json");
  });

  it("fails the documentation fitness claim closed while protected-main agent guidance is stale", () => {
    const agentGuidance = readFileSync("AGENTS.md", "utf8");
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const staleCentralScanGuidance =
      agentGuidance.includes("including stacked PRs") ||
      agentGuidance.includes("CRITICAL/HIGH, fixable only");

    if (staleCentralScanGuidance) {
      expect(gapAudit).toContain("protected-main `AGENTS.md`");
      expect(gapAudit.toLowerCase()).toContain("stale");
      expect(gapAudit).toContain("PR #90");
      expect(gapAudit).toContain("MEDIUM/HIGH/CRITICAL");
      expect(gapAudit).toContain("feature-base");
    }
  });

  it("separates design sufficiency from protected-main operational acceptance", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");

    expect(gapAudit).toContain("DESIGN_SUFFICIENT");
    expect(gapAudit).toContain("PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT");
    expect(gapAudit).toContain("c85d710804139c0697d7ef8fa47d02b1389e6d84");
    expect(gapAudit).toContain("nanoid@3.3.17");
    expect(gapAudit).not.toContain("Direct-main dependent PRs remain blocked by protected-main audit until it integrates");
  });
});