import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runAudit(configuredMaxAgeDays: string) {
  const outputDir = mkdtempSync(join(tmpdir(), "noema-acquisition-age-config-"));
  const result = spawnSync(process.execPath, ["scripts/acquisition-readiness-audit.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
      NOEMA_ACQUISITION_EVIDENCE_MAX_AGE_DAYS: configuredMaxAgeDays,
    },
  });
  rmSync(outputDir, { recursive: true, force: true });
  return result;
}

describe("acquisition evidence age configuration", () => {
  for (const configuredMaxAgeDays of ["Infinity", "NaN", "0", "-1"]) {
    it(`fails closed for explicit invalid max-age ${configuredMaxAgeDays}`, () => {
      const result = runAudit(configuredMaxAgeDays);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "NOEMA_ACQUISITION_EVIDENCE_MAX_AGE_DAYS must be a positive finite number",
      );
    });
  }
});
