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
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const auditScript = "scripts/acquisition-readiness-audit.mjs";
const entrypointTestTimeoutMs = 65_000;

function runAudit(outputDir: string) {
  return spawnSync(process.execPath, [auditScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_AUDIT_REPORT_ONLY: "1",
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
      NOEMA_REVENUE_EVIDENCE_PATH: join(outputDir, "missing-revenue.json"),
      NOEMA_TRANSFER_EVIDENCE_PATH: join(outputDir, "missing-transfer.json"),
      NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "",
      NOEMA_PILOT_LOG_PATH: join(outputDir, "missing-pilot.md"),
      NOEMA_SALEABLE_AUDIT_PATH: join(outputDir, "missing-saleable.json"),
      NOEMA_DATA_ROOM_MANIFEST_PATH: join(outputDir, "missing-data-room.json"),
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe.skipIf(process.platform === "win32")(
  "acquisition-readiness audit output symlink refusal",
  () => {
    it("refuses a pre-existing acquisition-audit symlink without modifying its target", () => {
      const temp = mkdtempSync(join(tmpdir(), "noema-readiness-audit-symlink-"));
      const targetPath = join(temp, "protected-target.txt");
      const auditPath = join(temp, "acquisition-audit.json");
      try {
        writeFileSync(targetPath, "sentinel-readiness-audit\n", "utf8");
        symlinkSync(targetPath, auditPath);

        const result = runAudit(temp);

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(readFileSync(targetPath, "utf8")).toBe("sentinel-readiness-audit\n");
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    }, entrypointTestTimeoutMs);

    it("refuses a symbolic-link output directory before creating acquisition-audit.json", () => {
      const temp = mkdtempSync(join(tmpdir(), "noema-readiness-audit-parent-symlink-"));
      const targetDirectory = join(temp, "protected-directory");
      const linkedOutput = join(temp, "linked-output");
      const escapedAudit = join(targetDirectory, "acquisition-audit.json");
      try {
        mkdirSync(targetDirectory);
        symlinkSync(targetDirectory, linkedOutput, "dir");

        const result = runAudit(linkedOutput);

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(existsSync(escapedAudit)).toBe(false);
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    }, entrypointTestTimeoutMs);
  },
);
