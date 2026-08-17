import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function validEvidence(sourceDocument = "security/noema-prod-review.md") {
  return {
    checklist_path: "docs/security-validation-checklist.md",
    updated_at: "2026-07-02",
    owner: "security",
    source_documents: [sourceDocument],
    validation_artifacts: ["artifacts/security/release-verify.log"],
  };
}

function validChecklist() {
  return "- [x] release gate passed\n- [x] smoke evidence reviewed\n";
}

describe("security validation retained-file integrity", () => {
  it("fails closed when reviewed evidence is supplied through a symbolic link", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-evidence-symlink-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const retainedEvidencePath = join(temp, "retained-security-evidence.json");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, validChecklist());
      writeFileSync(retainedEvidencePath, JSON.stringify(validEvidence()));
      symlinkSync(retainedEvidencePath, evidencePath);

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("security-validation-evidence: FAIL");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.passed).toBe(false);
      expect(audit.checks.find((check: { name: string }) => check.name === "security validation evidence present")?.details?.reason)
        .toBe("missing_or_unsafe");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("fails closed before parsing oversized reviewed evidence", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-evidence-oversized-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, validChecklist());
      writeFileSync(evidencePath, JSON.stringify(validEvidence(`security/${"a".repeat(1_048_576)}.md`)));

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("security-validation-evidence: FAIL");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.passed).toBe(false);
      expect(audit.checks.find((check: { name: string }) => check.name === "security validation evidence present")?.details?.reason)
        .toBe("missing_or_unsafe");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("fails closed when the reviewed checklist is supplied through a symbolic link", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-checklist-symlink-"));
    try {
      const retainedChecklistPath = join(temp, "retained-checklist.md");
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(retainedChecklistPath, validChecklist());
      symlinkSync(retainedChecklistPath, checklistPath);
      writeFileSync(evidencePath, JSON.stringify(validEvidence()));

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.checks.find((check: { name: string }) => check.name === "security validation checklist complete")?.details?.reason)
        .toBe("missing_or_unsafe");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("fails closed before parsing an oversized reviewed checklist", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-checklist-oversized-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, `${validChecklist()}${"a".repeat(1_048_576)}`);
      writeFileSync(evidencePath, JSON.stringify(validEvidence()));

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.checks.find((check: { name: string }) => check.name === "security validation checklist complete")?.details?.reason)
        .toBe("missing_or_unsafe");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
