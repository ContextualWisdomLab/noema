import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DATA_ROOM_OBJECTIVE,
  DATA_ROOM_REPOSITORY,
  DATA_ROOM_SCHEMA_VERSION,
  readStableFile,
  verifyDataRoomManifest,
  verifyDataRoomManifestFile,
} from "../scripts/lib/acquisition-data-room-integrity.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";

const testCatalog = [
  {
    id: "local-evidence",
    category: "security",
    kind: "file",
    path: "evidence/local.txt",
    required: true,
    requiredForFinalGate: true,
  },
  {
    id: "design-evidence",
    category: "product",
    kind: "external",
    url: "https://example.com/design",
    receiptPath: "artifacts/acquisition/design-evidence-receipt.json",
    artifactPath: "artifacts/acquisition/design-export.json",
    required: false,
    requiredForFinalGate: true,
  },
  {
    id: "verify-command",
    category: "automation",
    kind: "command",
    command: "npm run release:verify",
    required: true,
    requiredForFinalGate: true,
  },
] as const;

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalManifest(root: string, { external = false } = {}) {
  const localPath = join(root, "evidence", "local.txt");
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, "reviewed evidence\n");
  const bytes = readFileSync(localPath);
  const entries: Array<Record<string, unknown>> = [
    {
      ...testCatalog[0],
      status: "present",
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    },
    {
      ...testCatalog[1],
      status: external ? "present" : "declared",
      receiptVerified: external,
    },
    {
      ...testCatalog[2],
      status: "present",
    },
  ];
  const missingFinalGate = external ? [] : ["design-evidence"];
  return {
    schemaVersion: DATA_ROOM_SCHEMA_VERSION,
    repository: DATA_ROOM_REPOSITORY,
    objective: DATA_ROOM_OBJECTIVE,
    source: { commitSha: HEAD },
    passed: true,
    finalGatePassed: external,
    missingRequired: [],
    missingFinalGate,
    entries,
  };
}

function writeExternalReceipt(root: string) {
  const artifactPath = join(root, "artifacts", "acquisition", "design-export.json");
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, "{\"nodes\":3}\n");
  const artifact = readFileSync(artifactPath);
  const receiptPath = join(root, "artifacts", "acquisition", "design-evidence-receipt.json");
  writeFileSync(receiptPath, JSON.stringify({
    schemaVersion: 1,
    repository: DATA_ROOM_REPOSITORY,
    source: { commitSha: HEAD },
    sourceUrl: "https://example.com/design",
    collectedAt: "2026-08-07T00:00:00.000Z",
    collector: "cwl-acquisition-evidence",
    provenance: "manual immutable export retained in the acquisition data room",
    artifact: {
      path: "artifacts/acquisition/design-export.json",
      bytes: artifact.byteLength,
      sha256: sha256(artifact),
    },
  }, null, 2));
}

describe("acquisition data-room integrity", () => {
  it("rejects a forged all-green manifest instead of trusting persisted booleans", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-forged-"));
    try {
      const result = verifyDataRoomManifest({
        objective: DATA_ROOM_OBJECTIVE,
        passed: true,
        finalGatePassed: true,
        missingRequired: [],
        missingFinalGate: [],
        entries: [],
      }, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.finalGatePassed).toBe(false);
      expect(result.failures).toContain("schemaVersion must match the reviewed data-room schema");
      expect(result.failures).toContain("repository must match ContextualWisdomLab/noema");
      expect(result.failures).toContain("source.commitSha must match the exact audited commit");
      expect(result.failures).toContain("manifest entry set must exactly match the reviewed catalog");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("makes the actual npm acquisition audit fail closed on a forged all-green manifest", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-npm-forged-"));
    const manifestPath = join(temp, "forged-manifest.json");
    try {
      writeFileSync(manifestPath, JSON.stringify({
        schemaVersion: DATA_ROOM_SCHEMA_VERSION,
        repository: DATA_ROOM_REPOSITORY,
        objective: DATA_ROOM_OBJECTIVE,
        source: { commitSha: "0000000000000000000000000000000000000000" },
        passed: true,
        finalGatePassed: true,
        missingRequired: [],
        missingFinalGate: [],
        entries: [],
      }));
      const result = spawnSync("npm", ["run", "acquisition:audit"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
          NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: join(temp, "audit"),
        },
        encoding: "utf8",
        timeout: 30_000,
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("acquisition-data-room-integrity: FAIL");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("recomputes local hashes and refuses evidence modified after manifest generation", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-mutated-"));
    try {
      const manifest = canonicalManifest(temp);
      writeFileSync(join(temp, "evidence", "local.txt"), "changed evidence\n");
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("local-evidence file digest or byte size does not match retained evidence");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects same-size content mutation and persisted byte-size mismatch independently", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-digest-"));
    try {
      const manifest = canonicalManifest(temp);
      writeFileSync(join(temp, "evidence", "local.txt"), "reviewed evidencf\n");
      let result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });
      expect(result.failures).toContain("local-evidence file digest or byte size does not match retained evidence");

      writeFileSync(join(temp, "evidence", "local.txt"), "reviewed evidence\n");
      manifest.entries[0].bytes = Number(manifest.entries[0].bytes) + 1;
      result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });
      expect(result.failures).toContain("local-evidence file digest or byte size does not match retained evidence");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects symlink and non-regular substitution for retained local artifacts", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-substitution-"));
    try {
      const manifest = canonicalManifest(temp);
      const localPath = join(temp, "evidence", "local.txt");
      const target = join(temp, "alternate.txt");
      writeFileSync(target, "reviewed evidence\n");
      rmSync(localPath);
      symlinkSync(target, localPath);

      let result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("local-evidence file is missing, unsafe, non-regular, or exceeds the evidence limit");

      rmSync(localPath);
      mkdirSync(localPath);
      result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("local-evidence file is missing, unsafe, non-regular, or exceeds the evidence limit");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("treats a bare HTTPS declaration as non-verifying final-gate metadata", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-external-"));
    try {
      const manifest = canonicalManifest(temp);
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });

      expect(result.integrityPassed).toBe(true);
      expect(result.finalGatePassed).toBe(false);
      expect(result.missingFinalGate).toEqual(["design-evidence"]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("accepts external evidence only when an exact-commit receipt verifies a retained artifact", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-receipt-"));
    try {
      writeExternalReceipt(temp);
      const manifest = canonicalManifest(temp, { external: true });
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });

      expect(result.integrityPassed).toBe(true);
      expect(result.recomputedPassed).toBe(true);
      expect(result.finalGatePassed).toBe(true);
      expect(result.missingRequired).toEqual([]);
      expect(result.missingFinalGate).toEqual([]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects duplicate, unknown, and contradictory entry identities", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-identity-"));
    try {
      const manifest = canonicalManifest(temp);
      manifest.entries.push({ ...manifest.entries[0] });
      manifest.entries[1] = {
        ...manifest.entries[1],
        id: "unknown-entry",
      };
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("manifest entry ids must be unique");
      expect(result.failures).toContain("manifest entry set must exactly match the reviewed catalog");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects wrong repository, objective, exact commit, and release identity", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-binding-"));
    try {
      const manifest = canonicalManifest(temp);
      manifest.repository = "attacker/noema";
      manifest.objective = "other-objective";
      manifest.source.commitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      Object.assign(manifest, {
        release: {
          tag: "v9.9.9",
          commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      });
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        expectedReleaseTag: "v1.2.3",
        expectedReleaseCommitSha: "cccccccccccccccccccccccccccccccccccccccc",
        catalog: testCatalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("repository must match ContextualWisdomLab/noema");
      expect(result.failures).toContain("objective must match the acquisition-readiness objective");
      expect(result.failures).toContain("source.commitSha must match the exact audited commit");
      expect(result.failures).toContain("release identity must match the selected immutable release");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects malformed persisted gap lists even when retained evidence is unchanged", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-gap-list-"));
    try {
      const manifest = canonicalManifest(temp);
      manifest.missingFinalGate = [];
      manifest.finalGatePassed = true;
      const result = verifyDataRoomManifest(manifest, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.finalGatePassed).toBe(false);
      expect(result.failures).toContain("persisted finalGatePassed value contradicts trusted recomputation");
      expect(result.failures).toContain("persisted missingFinalGate list contradicts trusted recomputation");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects malformed and duplicate-key JSON before authorization", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-json-"));
    const manifestPath = join(temp, "manifest.json");
    try {
      writeFileSync(manifestPath, `{"schemaVersion":1,"schemaVersion":1,"repository":"${DATA_ROOM_REPOSITORY}"}`);
      const result = verifyDataRoomManifestFile(manifestPath, {
        rootDir: temp,
        expectedCommitSha: HEAD,
        catalog: testCatalog,
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toEqual(["manifest JSON is missing, unsafe, malformed, oversized, or contains duplicate object keys"]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("refuses path-to-descriptor identity drift after a bounded read", () => {
    const before = {
      dev: 1,
      ino: 10,
      size: 3,
      mtimeMs: 1,
      ctimeMs: 1,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    const after = { ...before, ino: 11 };
    const lstatSync = vi.fn()
      .mockReturnValueOnce(before)
      .mockReturnValueOnce(after);
    const fstatSync = vi.fn().mockReturnValue(before);
    const closeSync = vi.fn();
    const fileSystem = {
      constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
      lstatSync,
      openSync: vi.fn(() => 7),
      fstatSync,
      readSync: vi.fn((_fd, buffer: Buffer) => {
        buffer.set(Buffer.from("abc"));
        return 3;
      }),
      closeSync,
    };

    expect(readStableFile("evidence.json", 16, fileSystem)).toBeNull();
    expect(closeSync).toHaveBeenCalledWith(7);
  });
});
