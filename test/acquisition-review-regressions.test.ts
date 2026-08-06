import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DATA_ROOM_OBJECTIVE,
  DATA_ROOM_REPOSITORY,
  DATA_ROOM_SCHEMA_VERSION,
  materializeDataRoomManifest,
  readStableFile,
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
      mkdirSync(join(temp, "evidence"), { recursive: true });
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

  it("fails closed on invalid read bounds but tolerates a close failure after a stable empty read", () => {
    const metadata = {
      dev: 1,
      ino: 2,
      size: 0,
      mtimeMs: 3,
      ctimeMs: 4,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    const fileSystem = {
      constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
      lstatSync: vi.fn(() => metadata),
      openSync: vi.fn(() => 7),
      fstatSync: vi.fn(() => metadata),
      readSync: vi.fn(),
      closeSync: vi.fn(() => {
        throw new Error("close failed");
      }),
    };

    expect(readStableFile("unused", 0, fileSystem)).toBeNull();
    expect(fileSystem.lstatSync).not.toHaveBeenCalled();
    expect(readStableFile("empty", 16, fileSystem)).toEqual(Buffer.alloc(0));
    expect(fileSystem.closeSync).toHaveBeenCalledWith(7);
  });

  it("rejects unsupported catalog kinds without converting them into trusted presence", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-unsupported-catalog-"));
    try {
      const catalog = [{
        id: "unsupported-evidence",
        category: "security",
        kind: "unsupported",
        required: true,
        requiredForFinalGate: true,
      }];
      const manifest = {
        schemaVersion: DATA_ROOM_SCHEMA_VERSION,
        repository: DATA_ROOM_REPOSITORY,
        objective: DATA_ROOM_OBJECTIVE,
        source: { commitSha: HEAD },
        passed: false,
        finalGatePassed: false,
        missingRequired: ["unsupported-evidence"],
        missingFinalGate: ["unsupported-evidence"],
        entries: [{ ...catalog[0], status: "present" }],
      };
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog,
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("unsupported-evidence has an unsupported catalog kind");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each([
    ["2026-02-30T00:00:00.000Z", "bounded provenance"],
    ["2026-08-07T00:00:00.000Z", "x".repeat(4097)],
  ])("rejects invalid external receipt timestamp or bounded text (%s)", (collectedAt, provenance) => {
    const temp = mkdtempSync(join(tmpdir(), "noema-external-bounds-"));
    try {
      const artifactPath = "artifacts/acquisition/external.json";
      const receiptPath = "artifacts/acquisition/external-receipt.json";
      const absoluteArtifact = join(temp, artifactPath);
      const absoluteReceipt = join(temp, receiptPath);
      mkdirSync(join(temp, "artifacts", "acquisition"), { recursive: true });
      writeFileSync(absoluteArtifact, "{}\n");
      const artifact = Buffer.from("{}\n");
      writeFileSync(absoluteReceipt, JSON.stringify({
        schemaVersion: 1,
        repository: DATA_ROOM_REPOSITORY,
        source: { commitSha: HEAD },
        sourceUrl: "https://example.invalid/evidence",
        collectedAt,
        collector: "noema-test-collector",
        provenance,
        artifact: {
          path: artifactPath,
          bytes: artifact.byteLength,
          sha256: sha256(artifact),
        },
      }));
      const catalog = [{
        id: "external-evidence",
        category: "product",
        kind: "external",
        url: "https://example.invalid/evidence",
        receiptPath,
        artifactPath,
        required: false,
        requiredForFinalGate: true,
      }];
      const manifest = {
        schemaVersion: DATA_ROOM_SCHEMA_VERSION,
        repository: DATA_ROOM_REPOSITORY,
        objective: DATA_ROOM_OBJECTIVE,
        source: { commitSha: HEAD },
        passed: true,
        finalGatePassed: false,
        missingRequired: [],
        missingFinalGate: ["external-evidence"],
        entries: [{ ...catalog[0], status: "declared", receiptVerified: false }],
      };
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog,
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("external-evidence receipt does not authenticate the retained external artifact");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical reviewed paths before retained evidence can be selected", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-noncanonical-path-"));
    try {
      const catalog = [{
        id: "external-evidence",
        category: "product",
        kind: "external",
        url: "https://example.invalid/evidence",
        receiptPath: "artifacts//receipt.json",
        artifactPath: "artifacts/export.json",
        required: false,
        requiredForFinalGate: true,
      }];
      const manifest = {
        schemaVersion: DATA_ROOM_SCHEMA_VERSION,
        repository: DATA_ROOM_REPOSITORY,
        objective: DATA_ROOM_OBJECTIVE,
        source: { commitSha: HEAD },
        passed: true,
        finalGatePassed: false,
        missingRequired: [],
        missingFinalGate: ["external-evidence"],
        entries: [{ ...catalog[0], status: "declared", receiptVerified: false }],
      };
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog,
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("external-evidence receipt path is not canonical");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("materializes a reviewed command catalog directly without trusting persisted state", () => {
    const catalog = [{
      id: "verify-command",
      category: "automation",
      kind: "command",
      command: "npm run release:verify",
      required: true,
      requiredForFinalGate: true,
    }];
    const output = materializeDataRoomManifest({
      rootDir: process.cwd(),
      manifestPath: "artifacts/acquisition-readiness/test/data-room-manifest.json",
      commitSha: HEAD,
      generatedAt: "2026-08-07T00:00:00.000Z",
      catalog,
    });
    expect(output.passed).toBe(true);
    expect(output.finalGatePassed).toBe(true);
    expect(output.entries).toEqual([{ ...catalog[0], status: "present" }]);
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

  it.skipIf(process.platform === "win32")("shares one configured data-room directory and restricts existing outputs to owner-only mode", () => {
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
          NOEMA_DATA_ROOM_OUTPUT_DIR: temp,
          NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: "",
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
          NOEMA_DATA_ROOM_OUTPUT_DIR: "",
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
