import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-security-output-"));
  tempRoots.push(root);
  return root;
}

function runSecurityEvidence(root: string, auditPath: string) {
  return spawnSync(process.execPath, ["scripts/security-validation-evidence.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NOEMA_SECURITY_CHECKLIST_PATH: join(root, "missing-checklist.md"),
      NOEMA_SECURITY_EVIDENCE_PATH: join(root, "missing-security-evidence.json"),
      NOEMA_SECURITY_AUDIT_PATH: auditPath,
    },
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === "win32")(
  "security validation audit private output boundary",
  () => {
    it("refuses a pre-existing audit symlink without modifying its target", () => {
      const root = makeTempRoot();
      const auditPath = join(root, "audit", "security-validation-audit.json");
      mkdirSync(dirname(auditPath), { recursive: true });
      const sentinel = join(root, "sentinel.txt");
      writeFileSync(sentinel, "sentinel\n");
      symlinkSync(sentinel, auditPath);

      const result = runSecurityEvidence(root, auditPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(sentinel, "utf8")).toBe("sentinel\n");
    });

    it("refuses a symlinked audit parent before creating security evidence", () => {
      const root = makeTempRoot();
      const externalDir = join(root, "external-output");
      const linkedDir = join(root, "audit");
      mkdirSync(externalDir, { recursive: true });
      symlinkSync(externalDir, linkedDir, "dir");
      const auditPath = join(linkedDir, "security-validation-audit.json");

      const result = runSecurityEvidence(root, auditPath);
      const redirectedAudit = join(externalDir, "security-validation-audit.json");

      expect(result.status).not.toBe(0);
      expect(existsSync(redirectedAudit)).toBe(false);
    });
  },
);
