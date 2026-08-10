import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("canonical active-work documentation", () => {
  it("tracks the package-manager replacement and exact-release rights evidence", () => {
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const licensing = readFileSync("docs/LICENSING_AND_IP_TRANSFER.md", "utf8");

    expect(gapAudit).toContain("PR #89");
    expect(gapAudit).toContain("#78");
    expect(gapAudit.toLowerCase()).toContain("superseded");
    expect(gapAudit).not.toContain("#78 must be integrated");

    expect(traceability).toContain("#77/#89");
    expect(traceability).toContain("#78");
    expect(traceability.toLowerCase()).toContain("superseded");

    expect(licensing).toContain("artifact_rights_metadata");
    expect(licensing).toContain("PR #69");
    expect(licensing).toContain("duplicate");
    expect(licensing).toContain("UTF-8");
    expect(traceability).toContain("artifact_rights_metadata");
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
      expect(gapAudit).toContain("PR #87");
      expect(gapAudit).toContain("MEDIUM/HIGH/CRITICAL");
      expect(gapAudit).toContain("feature-base");
    }
  });
});
