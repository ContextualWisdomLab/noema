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

function validEvidence() {
  return {
    checklist_path: "docs/security-validation-checklist.md",
    updated_at: "2026-07-02",
    owner: "security",
    source_documents: ["security/noema-prod-review.md"],
    validation_artifacts: ["artifacts/security/release-verify.log"],
  };
}

describe("security validation evidence gate", () => {
  it("passes when checklist and reviewed evidence are complete", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-evidence-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, "- [x] release gate passed\n- [x] smoke evidence reviewed\n");
      writeFileSync(evidencePath, JSON.stringify(validEvidence()));

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("security-validation-evidence: PASS");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.passed).toBe(true);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("fails closed when checklist or evidence is incomplete", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-evidence-fail-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, "- [x] release gate passed\n- [ ] smoke evidence reviewed\n");
      writeFileSync(evidencePath, JSON.stringify({
        checklist_path: "docs/security-validation-checklist.md",
        updated_at: "2026-07-02",
        owner: "replace-with-security-owner",
        source_documents: ["docs/evidence-templates/security-validation-evidence.example.json"],
        validation_artifacts: ["replace-with-release-verify-log-path"],
      }));

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("security-validation-evidence: FAIL");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.passed).toBe(false);
      expect(audit.checks.map((check: { name: string }) => check.name)).toEqual([
        "security validation checklist complete",
        "security validation evidence present",
      ]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects malformed UTF-8 in otherwise passing security evidence", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-evidence-utf8-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, "- [x] release gate passed\n- [x] smoke evidence reviewed\n");
      const beforeInvalidByte = Buffer.from(
        '{"checklist_path":"docs/security-validation-checklist.md","updated_at":"2026-07-02","owner":"sec',
        "utf8",
      );
      const afterInvalidByte = Buffer.from(
        'urity","source_documents":["security/noema-prod-review.md"],"validation_artifacts":["artifacts/security/release-verify.log"]}',
        "utf8",
      );
      writeFileSync(evidencePath, Buffer.concat([beforeInvalidByte, Buffer.from([0xff]), afterInvalidByte]));

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("security-validation-evidence: FAIL");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.passed).toBe(false);
      expect(audit.checks.find((check: { name: string }) => check.name === "security validation evidence present")?.details?.reason)
        .toBe("invalid_utf8");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects malformed UTF-8 in an otherwise complete checklist", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-checklist-utf8-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, Buffer.concat([
        Buffer.from("- [x] release ", "utf8"),
        Buffer.from([0xff]),
        Buffer.from(" gate passed\n- [x] smoke evidence reviewed\n", "utf8"),
      ]));
      writeFileSync(evidencePath, JSON.stringify(validEvidence()));

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("security-validation-evidence: FAIL");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.passed).toBe(false);
      expect(audit.checks.find((check: { name: string }) => check.name === "security validation checklist complete")?.details?.reason)
        .toBe("invalid_utf8");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("keeps valid UTF-8 with invalid JSON separate from byte-decoding failure", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-security-evidence-json-"));
    try {
      const checklistPath = join(temp, "checklist.md");
      const evidencePath = join(temp, "security-validation-evidence.json");
      const auditPath = join(temp, "audit", "security-validation-audit.json");
      writeFileSync(checklistPath, "- [x] release gate passed\n- [x] smoke evidence reviewed\n");
      writeFileSync(evidencePath, "{ not valid json }", "utf8");

      const result = runSecurityEvidence(checklistPath, evidencePath, auditPath);

      expect(result.status).toBe(1);
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));
      expect(audit.checks.find((check: { name: string }) => check.name === "security validation evidence present")?.details?.reason)
        .toBe("invalid_json");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
