import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_ROOM_OBJECTIVE,
  DATA_ROOM_REPOSITORY,
  DATA_ROOM_SCHEMA_VERSION,
  verifyDataRoomManifest,
} from "../scripts/lib/acquisition-data-room-integrity.mjs";
import { buildAcquisitionGitEnvironment } from "../scripts/lib/acquisition-git-preflight.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";

function emptyManifest() {
  return {
    schemaVersion: DATA_ROOM_SCHEMA_VERSION,
    repository: DATA_ROOM_REPOSITORY,
    objective: DATA_ROOM_OBJECTIVE,
    source: { commitSha: HEAD },
    passed: true,
    finalGatePassed: true,
    missingRequired: [],
    missingFinalGate: [],
    entries: [],
  };
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("acquisition review regressions", () => {
  it("fails closed when the reviewed catalog is not a bounded non-empty array", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-invalid-catalog-"));
    try {
      const notArray = verifyDataRoomManifest(emptyManifest(), {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: null as never,
      });
      expect(notArray.integrityPassed).toBe(false);
      expect(notArray.finalGatePassed).toBe(false);
      expect(notArray.failures).toContain("reviewed catalog must be a bounded non-empty array");

      const oversized = verifyDataRoomManifest(emptyManifest(), {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: Array.from({ length: 10_000 }, (_, index) => ({
          id: `entry-${index}`,
          category: "security",
          kind: "command",
          command: "true",
          required: false,
          requiredForFinalGate: false,
        })),
      });
      expect(oversized.integrityPassed).toBe(false);
      expect(oversized.finalGatePassed).toBe(false);
      expect(oversized.failures).toContain("reviewed catalog must be a bounded non-empty array");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("treats an existing zero-byte regular evidence file as present rather than unsafe", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-empty-evidence-"));
    try {
      const relativePath = "evidence/empty.ndjson";
      const absolutePath = join(temp, relativePath);
      writeFileSync(absolutePath, "", { flag: "w" });
      const catalog = [{
        id: "empty-evidence",
        category: "operations",
        kind: "file",
        path: relativePath,
        required: true,
        requiredForFinalGate: true,
      }];
      const manifest = {
        schemaVersion: DATA_ROOM_SCHEMA_VERSION,
        repository: DATA_ROOM_REPOSITORY,
        objective: DATA_ROOM_OBJECTIVE,
        source: { commitSha: HEAD },
        passed: true,
        finalGatePassed: true,
        missingRequired: [],
        missingFinalGate: [],
        entries: [{
          ...catalog[0],
          status: "present",
          bytes: 0,
          sha256: sha256(Buffer.alloc(0)),
        }],
      };

      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog,
      });
      expect(result.integrityPassed).toBe(true);
      expect(result.finalGatePassed).toBe(true);
      expect(result.failures).toEqual([]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("pins safe.directory to the exact command cwd without restoring ambient Git configuration", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-safe-directory-"));
    try {
      const environment = buildAcquisitionGitEnvironment({ PATH: process.env.PATH }, process.platform, temp);
      expect(environment.GIT_CONFIG_COUNT).toBe("4");
      expect(environment.GIT_CONFIG_KEY_3).toBe("safe.directory");
      expect(environment.GIT_CONFIG_VALUE_3).toBe(resolve(temp));
      expect(environment.GIT_CONFIG_NOSYSTEM).toBe("1");
      expect(environment.GIT_CONFIG_GLOBAL).toBe(process.platform === "win32" ? "NUL" : "/dev/null");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("restricts existing manifest and audit outputs to owner-only mode on every write path", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-mode-"));
    const manifestPath = join(temp, "data-room-manifest.json");
    const auditPath = join(temp, "data-room-integrity-audit.json");
    try {
      writeFileSync(manifestPath, "{}\n", { mode: 0o644 });
      chmodSync(manifestPath, 0o644);
      const manifestResult = spawnSync(process.execPath, ["scripts/acquisition-data-room-manifest-secure.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NOEMA_DATA_ROOM_OUTPUT_DIR: temp,
          NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
          NOEMA_DATA_ROOM_SOURCE_COMMIT: "",
          NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "",
        },
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(manifestResult.error).toBeUndefined();
      expect(statSync(manifestPath).mode & 0o777).toBe(0o600);

      writeFileSync(auditPath, "{}\n", { mode: 0o644 });
      chmodSync(auditPath, 0o644);
      const normalAudit = spawnSync(process.execPath, ["scripts/acquisition-data-room-integrity-audit.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
          NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
          NOEMA_DATA_ROOM_SOURCE_COMMIT: "",
          NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "",
        },
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(normalAudit.error).toBeUndefined();
      expect(statSync(auditPath).mode & 0o777).toBe(0o600);

      chmodSync(auditPath, 0o644);
      const failureAudit = spawnSync(process.execPath, ["scripts/acquisition-data-room-integrity-audit.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
          NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
          NOEMA_DATA_ROOM_SOURCE_COMMIT: "not-a-full-sha",
          NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "",
        },
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(failureAudit.error).toBeUndefined();
      expect(statSync(auditPath).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
