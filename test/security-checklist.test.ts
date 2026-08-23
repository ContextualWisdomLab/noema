import { describe, expect, it } from "vitest";
import { evaluateSecurityChecklistText, evaluateSecurityEvidence } from "../scripts/lib/security-checklist.mjs";

function reviewedSecurityEvidence(updatedAt: string) {
  return {
    checklist_path: "docs/security-validation-checklist.md",
    updated_at: updatedAt,
    owner: "security",
    source_documents: ["security/noema-prod-review.md"],
    validation_artifacts: ["artifacts/security/release-verify.log"],
  };
}

describe("security validation checklist parser", () => {
  it("passes only when every checklist item is checked", () => {
    const result = evaluateSecurityChecklistText(`
# Checklist
- [x] release gate passed
- [X] secrets rotated
`);

    expect(result.passed).toBe(true);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(2);
    expect(result.unchecked).toEqual([]);
  });

  it("reports unchecked checklist items", () => {
    const result = evaluateSecurityChecklistText(`
# Checklist
- [x] release gate passed
- [ ] production provenance reviewed
`);

    expect(result.passed).toBe(false);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(1);
    expect(result.unchecked).toEqual(["production provenance reviewed"]);
  });

  it("requires reviewed security evidence references", () => {
    const result = evaluateSecurityEvidence({
      checklist_path: "docs/security-validation-checklist.md",
      updated_at: "2026-07-02",
      owner: "replace-with-security-owner",
      source_documents: ["docs/evidence-templates/security-validation-evidence.example.json"],
      validation_artifacts: ["replace-with-release-verify-log-path"],
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("owner cannot be a placeholder");
    expect(result.failures).toContain("source_documents must reference reviewed evidence");
    expect(result.failures).toContain("validation_artifacts must reference reviewed evidence");
  });

  it("accepts security evidence with reviewed references", () => {
    const result = evaluateSecurityEvidence(reviewedSecurityEvidence("2026-07-02"));

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("accepts a real RFC 3339 timestamp", () => {
    const result = evaluateSecurityEvidence(reviewedSecurityEvidence("2026-07-02T10:30:15.250Z"));

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects surrounding whitespace instead of normalizing security evidence timestamp identity", () => {
    const result = evaluateSecurityEvidence(reviewedSecurityEvidence(" 2026-07-02T10:30:15.250Z "));

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("updated_at must be an ISO date or timestamp");
  });

  it("rejects security evidence dated even slightly in the future", () => {
    const futureTimestamp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = evaluateSecurityEvidence(reviewedSecurityEvidence(futureTimestamp));

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("updated_at cannot be in the future");
  });

  it.each([
    "07/02/2026",
    "2026-07-02 10:30:15",
    "2026-02-30",
    "2026-13-01",
    "2026-07-02T24:00:00Z",
  ])("rejects non-ISO or impossible updated_at value %s", (updatedAt) => {
    const result = evaluateSecurityEvidence(reviewedSecurityEvidence(updatedAt));

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("updated_at must be an ISO date or timestamp");
  });
});
