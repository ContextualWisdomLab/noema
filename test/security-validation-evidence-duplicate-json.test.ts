import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runSecurityEvidence(checklistPath: string, evidencePath: string, auditPath: string) {
  return spawnSync(process.execPath, ["scripts/security-validation-evidence.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_SECURITY_CHECKLIST_PATH: checklistPath,
      NOEMA_SECURITY_EVIDENCE_PATH: evidencePath,
      NOEMA_SECURITY_AUDIT_PATH: auditPath,
    },
    encoding: "utf8",
  });
}

describe("security validation evidence JSON integrity", () => {
  it("rejects duplicate decoded keys instead of accepting JSON last-key-wins evidence", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-evidence-duplicate-json-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, "- [x] release gate passed\n- [x] smoke evidence reviewed\n", "utf8");
      writeFileSync(
        evidencePath,
        '{"checklist_path":"docs/security-validation-checklist.md","updated_at":"2026-07-02","owner":"replace-with-security-owner","ow\\u006eer":"security","source_documents":["security/noema-prod-review.md"],"validation_artifacts":["artifacts/security/release-verify.log"]}',
        "utf8",
      );

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("security-validation-evidence: FAIL");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.passed).toBe(false);
      expect(
        audit.checks.find(
          (check: { name: string }) => check.name === "security validation evidence present",
        )?.details?.reason,
      ).toBe("duplicate_keys");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
