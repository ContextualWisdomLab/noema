import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function runEntrypoint(script: string, environment: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_DATA_ROOM_SOURCE_COMMIT: "",
      NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "",
      ...environment,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe.skipIf(process.platform === "win32")("acquisition output symlink refusal", () => {
  it("refuses a pre-existing manifest symlink without modifying its target", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-manifest-symlink-"));
    const targetPath = join(temp, "protected-target.txt");
    const manifestPath = join(temp, "data-room-manifest.json");
    try {
      writeFileSync(targetPath, "sentinel-manifest\n", "utf8");
      symlinkSync(targetPath, manifestPath);

      const result = runEntrypoint("scripts/acquisition-data-room-manifest-secure.mjs", {
        NOEMA_DATA_ROOM_OUTPUT_DIR: temp,
        NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: "",
        NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(readFileSync(targetPath, "utf8")).toBe("sentinel-manifest\n");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("refuses a pre-existing audit symlink without modifying its target", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-audit-symlink-"));
    const manifestPath = join(temp, "data-room-manifest.json");
    const auditPath = join(temp, "data-room-integrity-audit.json");
    const targetPath = join(temp, "protected-target.txt");
    try {
      const manifestResult = runEntrypoint("scripts/acquisition-data-room-manifest-secure.mjs", {
        NOEMA_DATA_ROOM_OUTPUT_DIR: temp,
        NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: "",
        NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
      });
      expect(manifestResult.error).toBeUndefined();
      expect(manifestResult.status).toBe(0);

      writeFileSync(targetPath, "sentinel-audit\n", "utf8");
      symlinkSync(targetPath, auditPath);

      const auditResult = runEntrypoint("scripts/acquisition-data-room-integrity-audit.mjs", {
        NOEMA_DATA_ROOM_OUTPUT_DIR: temp,
        NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: "",
        NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
      });

      expect(auditResult.error).toBeUndefined();
      expect(auditResult.status).toBe(1);
      expect(readFileSync(targetPath, "utf8")).toBe("sentinel-audit\n");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
