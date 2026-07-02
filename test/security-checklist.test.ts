import { describe, expect, it } from "vitest";
import { evaluateSecurityChecklistText, evaluateSecurityEvidence } from "../scripts/lib/security-checklist.mjs";

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
    const result = evaluateSecurityEvidence({
      checklist_path: "docs/security-validation-checklist.md",
      updated_at: "2026-07-02",
      owner: "security",
      source_documents: ["security/noema-prod-review.md"],
      validation_artifacts: ["artifacts/security/release-verify.log"],
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });
});
