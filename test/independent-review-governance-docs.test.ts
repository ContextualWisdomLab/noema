import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("independent reviewer governance documentation", () => {
  it("keeps independent approval authority distinct from automated evidence", () => {
    const index = readFileSync("docs/adr/README.md", "utf8");
    const decision = readFileSync(
      "docs/adr/0011-independent-reviewer-governance.md",
      "utf8",
    );
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");

    expect(index).toContain(
      "[0011](./0011-independent-reviewer-governance.md) | Proposed",
    );

    for (const phrase of [
      "eligible independent non-author approval",
      "formal GitHub review",
      "COMMENTED",
      "check run",
      "commit status",
      "model judgement",
      "reviewer eligibility",
      "stale approval",
      "fail closed",
      "issue #27",
      "issue #29",
    ]) {
      expect(decision).toContain(phrase);
    }

    expect(traceability).toContain("ADR-0011 Independent reviewer governance");
    expect(traceability).toContain("qualifying independent approval");
    expect(gapAudit).toContain("eleven ADR baseline");
    expect(gapAudit).toContain("ADR-0011");
    expect(gapAudit).toContain("independent reviewer governance");
    expect(changelog).toContain("ADR-0011");
    expect(changelog).toContain("design sufficiency");
    expect(changelog).toContain("protected-main operational sufficiency");
  });
});