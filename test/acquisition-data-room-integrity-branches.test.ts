import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DATA_ROOM_OBJECTIVE,
  DATA_ROOM_REPOSITORY,
  DATA_ROOM_SCHEMA_VERSION,
  MAX_DATA_ROOM_EVIDENCE_BYTES,
  MAX_DATA_ROOM_JSON_BYTES,
  materializeDataRoomManifest,
  readStableFile,
  verifyDataRoomManifest,
  verifyDataRoomManifestFile,
} from "../scripts/lib/acquisition-data-room-integrity.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const RELEASE = "89abcdef0123456789abcdef0123456789abcdef";

function digest(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function manifest(entries: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: DATA_ROOM_SCHEMA_VERSION,
    repository: DATA_ROOM_REPOSITORY,
    objective: DATA_ROOM_OBJECTIVE,
    source: { commitSha: HEAD },
    passed: true,
    finalGatePassed: true,
    missingRequired: [],
    missingFinalGate: [],
    entries,
    ...overrides,
  };
}

function fileEntry(path = "evidence/value.txt", overrides: Record<string, unknown> = {}) {
  return {
    id: "file-evidence",
    category: "security",
    kind: "file",
    path,
    required: true,
    requiredForFinalGate: true,
    ...overrides,
  };
}

function commandEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "verify-command",
    category: "automation",
    kind: "command",
    command: "npm run release:verify",
    required: true,
    requiredForFinalGate: true,
    ...overrides,
  };
}

function externalEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "external-evidence",
    category: "product",
    kind: "external",
    url: "https://example.invalid/evidence",
    receiptPath: "artifacts/acquisition/external-receipt.json",
    artifactPath: "artifacts/acquisition/external.json",
    required: false,
    requiredForFinalGate: true,
    ...overrides,
  };
}

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    size: 3,
    mtimeMs: 4,
    ctimeMs: 5,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function fileSystemFor(before = metadata(), opened = before) {
  return {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
    lstatSync: vi.fn(() => before),
    openSync: vi.fn(() => 7),
    fstatSync: vi.fn(() => opened),
    readSync: vi.fn((_descriptor: number, buffer: Buffer, offset: number, length: number) => {
      buffer.set(Buffer.from("abc").subarray(offset, offset + length), offset);
      return length;
    }),
    closeSync: vi.fn(),
  };
}

function writeExternalFixture(root: string, receiptOverrides: Record<string, unknown> = {}) {
  const entry = externalEntry();
  const artifactAbsolute = join(root, String(entry.artifactPath));
  const receiptAbsolute = join(root, String(entry.receiptPath));
  mkdirSync(join(root, "artifacts", "acquisition"), { recursive: true });
  const bytes = Buffer.from("{\"nodes\":3}\n");
  writeFileSync(artifactAbsolute, bytes);
  const receipt = {
    schemaVersion: 1,
    repository: DATA_ROOM_REPOSITORY,
    source: { commitSha: HEAD },
    sourceUrl: entry.url,
    collectedAt: "2026-08-07T00:00:00.000Z",
    collector: "noema-tests",
    provenance: "immutable local export",
    artifact: {
      path: entry.artifactPath,
      bytes: bytes.byteLength,
      sha256: digest(bytes),
    },
    ...receiptOverrides,
  };
  writeFileSync(receiptAbsolute, JSON.stringify(receipt));
  return { entry, bytes, receiptAbsolute, artifactAbsolute };
}

describe("acquisition data-room integrity defensive branches", () => {
  it.each([
    ["null metadata", null],
    ["missing isFile", { ...metadata(), isFile: undefined }],
    ["missing isSymbolicLink", { ...metadata(), isSymbolicLink: undefined }],
    ["not a file", metadata({ isFile: () => false })],
    ["symbolic link", metadata({ isSymbolicLink: () => true })],
    ["non-integer size", metadata({ size: 1.5 })],
    ["negative size", metadata({ size: -1 })],
    ["oversized file", metadata({ size: MAX_DATA_ROOM_EVIDENCE_BYTES + 1 })],
  ])("rejects unsafe initial metadata: %s", (_label, before) => {
    const fs = fileSystemFor(before as never);
    expect(readStableFile("ignored", MAX_DATA_ROOM_EVIDENCE_BYTES, fs)).toBeNull();
    expect(fs.openSync).not.toHaveBeenCalled();
  });

  it("rejects invalid maximum bounds without touching the filesystem", () => {
    const fs = fileSystemFor();
    expect(readStableFile("ignored", Number.NaN, fs)).toBeNull();
    expect(readStableFile("ignored", 1.5, fs)).toBeNull();
    expect(readStableFile("ignored", -1, fs)).toBeNull();
    expect(fs.lstatSync).not.toHaveBeenCalled();
  });

  it("rejects missing or non-integer no-follow/open constants", () => {
    const missingReadOnly = { ...fileSystemFor(), constants: { O_NOFOLLOW: 1 } };
    const missingNoFollow = { ...fileSystemFor(), constants: { O_RDONLY: 0 } };
    const nonInteger = { ...fileSystemFor(), constants: { O_RDONLY: 0, O_NOFOLLOW: 1.5 } };
    expect(readStableFile("ignored", 8, missingReadOnly as never)).toBeNull();
    expect(readStableFile("ignored", 8, missingNoFollow as never)).toBeNull();
    expect(readStableFile("ignored", 8, nonInteger as never)).toBeNull();
  });

  it.each([
    ["device", { dev: 99 }],
    ["inode", { ino: 99 }],
    ["size", { size: 2 }],
    ["mtime", { mtimeMs: 99 }],
    ["ctime", { ctimeMs: 99 }],
  ])("rejects opened descriptor identity drift: %s", (_label, drift) => {
    const before = metadata();
    const fs = fileSystemFor(before, metadata(drift));
    expect(readStableFile("ignored", 8, fs)).toBeNull();
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });

  it("handles partial reads and rejects invalid/truncated reads", () => {
    const stable = metadata({ size: 3 });
    const partial = fileSystemFor(stable, stable);
    partial.readSync
      .mockImplementationOnce((_descriptor: number, buffer: Buffer) => {
        buffer[0] = 97;
        return 1;
      })
      .mockImplementationOnce((_descriptor: number, buffer: Buffer) => {
        buffer.set(Buffer.from("bc"), 1);
        return 2;
      });
    expect(readStableFile("ignored", 8, partial)).toEqual(Buffer.from("abc"));

    for (const count of [0, -1, 1.5, Number.NaN]) {
      const fs = fileSystemFor(stable, stable);
      fs.readSync.mockReturnValueOnce(count);
      expect(readStableFile("ignored", 8, fs)).toBeNull();
    }
  });

  it("fails closed on filesystem exceptions before, during, and after a read", () => {
    const stable = metadata({ size: 3 });
    const failingOperations = ["lstatSync", "openSync", "fstatSync", "readSync"] as const;
    for (const operation of failingOperations) {
      const fs = fileSystemFor(stable, stable);
      fs[operation].mockImplementationOnce(() => {
        throw new Error(`${operation} failed`);
      });
      expect(readStableFile("ignored", 8, fs)).toBeNull();
    }

    const afterDescriptor = fileSystemFor(stable, stable);
    afterDescriptor.fstatSync
      .mockReturnValueOnce(stable)
      .mockReturnValueOnce(metadata({ ino: 9 }));
    expect(readStableFile("ignored", 8, afterDescriptor)).toBeNull();

    const afterPath = fileSystemFor(stable, stable);
    afterPath.lstatSync
      .mockReturnValueOnce(stable)
      .mockImplementationOnce(() => {
        throw new Error("post-read path lookup failed");
      });
    expect(readStableFile("ignored", 8, afterPath)).toBeNull();
  });

  it.each([
    ["non-string", 7],
    ["empty", ""],
    ["oversized", "a".repeat(1025)],
    ["control", "evidence/bad\nname"],
    ["backslash", "evidence\\bad"],
    ["absolute", "/tmp/evidence"],
    ["empty component", "evidence//value"],
    ["dot component", "evidence/./value"],
    ["parent component", "evidence/../value"],
  ])("materializes unsafe status for non-canonical file paths: %s", (_label, path) => {
    const entry = fileEntry(path as never);
    const output = materializeDataRoomManifest({
      rootDir: process.cwd(),
      manifestPath: "unused.json",
      commitSha: HEAD,
      catalog: [entry],
    });
    expect(output.entries[0].status).toBe("unsafe");
    expect(output.passed).toBe(false);
    expect(output.finalGatePassed).toBe(false);
  });

  it("distinguishes missing files from unreadable filesystem failures", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-missing-"));
    try {
      const entry = fileEntry();
      const missing = materializeDataRoomManifest({
        rootDir: root,
        manifestPath: "unused.json",
        commitSha: HEAD,
        catalog: [entry],
      });
      expect(missing.entries[0].status).toBe("missing");

      const fs = fileSystemFor();
      fs.lstatSync.mockImplementation(() => {
        const error = new Error("denied");
        Object.assign(error, { code: "EACCES" });
        throw error;
      });
      const unsafe = materializeDataRoomManifest({
        rootDir: root,
        manifestPath: "unused.json",
        commitSha: HEAD,
        catalog: [entry],
        fileSystem: fs,
      });
      expect(unsafe.entries[0].status).toBe("unsafe");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["invalid utf8", Buffer.from([0xff])],
    ["malformed json", Buffer.from("{")],
    ["scalar json", Buffer.from("42")],
  ])("rejects unsafe manifest JSON: %s", (_label, bytes) => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-json-"));
    try {
      const path = join(root, "manifest.json");
      writeFileSync(path, bytes);
      const result = verifyDataRoomManifestFile(path, {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [commandEntry()],
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toEqual([
        "manifest JSON is missing, unsafe, malformed, oversized, or contains duplicate object keys",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a missing manifest file and a non-object manifest value", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-nonobject-"));
    try {
      expect(verifyDataRoomManifestFile(join(root, "missing.json"), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [commandEntry()],
      }).integrityPassed).toBe(false);
      expect(verifyDataRoomManifest(null, {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [commandEntry()],
      }).failures).toEqual(["manifest must be a JSON object"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts an exact immutable release identity and rejects unexpected release metadata", () => {
    const entry = commandEntry();
    const released = manifest([{ ...entry, status: "present" }], {
      release: { tag: "v1.2.3", commitSha: RELEASE },
    });
    expect(verifyDataRoomManifest(released, {
      expectedCommitSha: HEAD,
      expectedReleaseTag: "v1.2.3",
      expectedReleaseCommitSha: RELEASE,
      catalog: [entry],
    }).integrityPassed).toBe(true);

    const unexpected = manifest([{ ...entry, status: "present" }], {
      release: { tag: "v1.2.3", commitSha: RELEASE },
    });
    expect(verifyDataRoomManifest(unexpected, {
      expectedCommitSha: HEAD,
      catalog: [entry],
    }).failures).toContain("release identity must be absent when no immutable release is selected");
  });

  it("rejects empty catalogs, non-array entries, malformed entries, and immutable identity changes", () => {
    expect(verifyDataRoomManifest(manifest([]), {
      expectedCommitSha: HEAD,
      catalog: [],
    }).failures).toContain("reviewed catalog must be a bounded non-empty array");

    const entry = commandEntry();
    const nonArrayEntries = manifest([], { entries: null });
    expect(verifyDataRoomManifest(nonArrayEntries, {
      expectedCommitSha: HEAD,
      catalog: [entry],
    }).failures).toContain("manifest entry set must exactly match the reviewed catalog");

    const malformed = manifest([null as never, { id: 7 } as never], {
      passed: false,
      finalGatePassed: false,
      missingRequired: [entry.id],
      missingFinalGate: [entry.id],
    });
    expect(verifyDataRoomManifest(malformed, {
      expectedCommitSha: HEAD,
      catalog: [entry],
    }).failures).toContain("manifest entries must be objects with reviewed ids");

    const changedIdentity = manifest([{ ...entry, command: "true", status: "present" }]);
    expect(verifyDataRoomManifest(changedIdentity, {
      expectedCommitSha: HEAD,
      catalog: [entry],
    }).failures).toContain("verify-command immutable catalog identity does not match policy");
  });

  it("cross-checks missing and contradictory persisted file state", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-state-"));
    try {
      const entry = fileEntry();
      const missingManifest = manifest([{
        ...entry,
        status: "present",
        bytes: 1,
        sha256: "0".repeat(64),
      }], {
        passed: false,
        finalGatePassed: false,
        missingRequired: [entry.id],
        missingFinalGate: [entry.id],
      });
      const result = verifyDataRoomManifest(missingManifest, {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [entry],
      });
      expect(result.failures).toContain("file-evidence persisted file status does not match retained evidence");

      mkdirSync(join(root, "evidence"), { recursive: true });
      writeFileSync(join(root, String(entry.path)), "abc");
      const persistedMissing = manifest([{
        ...entry,
        status: "missing",
        bytes: null,
        sha256: null,
      }]);
      expect(verifyDataRoomManifest(persistedMissing, {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [entry],
      }).failures).toContain("file-evidence file digest or byte size does not match retained evidence");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("cross-checks command status and persisted aggregate claims", () => {
    const entry = commandEntry();
    const result = verifyDataRoomManifest(manifest([{ ...entry, status: "missing" }], {
      passed: false,
      finalGatePassed: false,
      missingRequired: null,
      missingFinalGate: ["wrong-id"],
    }), {
      expectedCommitSha: HEAD,
      catalog: [entry],
    });
    expect(result.failures).toContain("verify-command command status does not match the reviewed catalog");
    expect(result.failures).toContain("persisted passed value contradicts trusted recomputation");
    expect(result.failures).toContain("persisted finalGatePassed value contradicts trusted recomputation");
    expect(result.failures).toContain("persisted missingRequired list contradicts trusted recomputation");
    expect(result.failures).toContain("persisted missingFinalGate list contradicts trusted recomputation");
  });

  it("accounts for catalog entries omitted from the manifest", () => {
    const required = commandEntry();
    const optional = commandEntry({
      id: "optional-command",
      command: "true",
      required: false,
      requiredForFinalGate: false,
    });
    const result = verifyDataRoomManifest(manifest([], {
      passed: false,
      finalGatePassed: false,
      missingRequired: [required.id],
      missingFinalGate: [required.id],
    }), {
      expectedCommitSha: HEAD,
      catalog: [required, optional],
    });
    expect(result.missingRequired).toContain(required.id);
    expect(result.missingRequired).not.toContain(optional.id);
    expect(result.missingFinalGate).toContain(required.id);
    expect(result.missingFinalGate).not.toContain(optional.id);
  });

  it("rejects non-canonical external artifact paths and unreadable or malformed receipts", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-receipt-errors-"));
    try {
      const invalidArtifact = externalEntry({ artifactPath: "artifacts/../external.json" });
      let result = verifyDataRoomManifest(manifest([{
        ...invalidArtifact,
        status: "declared",
        receiptVerified: false,
      }], {
        finalGatePassed: false,
        missingFinalGate: [invalidArtifact.id],
      }), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [invalidArtifact],
      });
      expect(result.failures).toContain("external-evidence reviewed retained artifact path is not canonical");

      const fixture = writeExternalFixture(root);
      writeFileSync(fixture.receiptAbsolute, "{");
      result = verifyDataRoomManifest(manifest([{
        ...fixture.entry,
        status: "declared",
        receiptVerified: false,
      }], {
        finalGatePassed: false,
        missingFinalGate: [fixture.entry.id],
      }), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [fixture.entry],
      });
      expect(result.failures).toContain("external-evidence receipt is malformed, ambiguous, oversized, or unsafe");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["schema", { schemaVersion: 2 }],
    ["repository", { repository: "other/repository" }],
    ["source commit", { source: { commitSha: RELEASE } }],
    ["source URL", { sourceUrl: "https://example.invalid/other" }],
    ["timestamp type", { collectedAt: 7 }],
    ["timestamp shape", { collectedAt: "2026-08-07" }],
    ["collector type", { collector: 7 }],
    ["collector empty", { collector: "" }],
    ["collector oversized", { collector: "x".repeat(257) }],
    ["collector control", { collector: "bad\ncollector" }],
    ["provenance type", { provenance: 7 }],
    ["provenance empty", { provenance: "" }],
    ["provenance control", { provenance: "bad\nprovenance" }],
  ])("rejects external receipt identity field: %s", (_label, overrides) => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-receipt-field-"));
    try {
      const fixture = writeExternalFixture(root, overrides);
      const result = verifyDataRoomManifest(manifest([{
        ...fixture.entry,
        status: "declared",
        receiptVerified: false,
      }], {
        finalGatePassed: false,
        missingFinalGate: [fixture.entry.id],
      }), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [fixture.entry],
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("external-evidence receipt does not authenticate the retained external artifact");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["artifact missing", { artifact: undefined }],
    ["artifact scalar", { artifact: 7 }],
    ["artifact wrong path", { artifact: { path: "README.md", bytes: 1, sha256: "0".repeat(64) } }],
  ])("rejects external receipt artifact identity: %s", (_label, overrides) => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-artifact-id-"));
    try {
      const fixture = writeExternalFixture(root, overrides);
      const result = verifyDataRoomManifest(manifest([{
        ...fixture.entry,
        status: "declared",
        receiptVerified: false,
      }], {
        finalGatePassed: false,
        missingFinalGate: [fixture.entry.id],
      }), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [fixture.entry],
      });
      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("external-evidence receipt does not authenticate the reviewed retained artifact path");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects external artifact size/hash errors and persisted external status contradictions", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-artifact-fields-"));
    try {
      for (const artifact of [
        { path: "artifacts/acquisition/external.json", bytes: 0, sha256: "0".repeat(64) },
        { path: "artifacts/acquisition/external.json", bytes: 12.5, sha256: "0".repeat(64) },
        { path: "artifacts/acquisition/external.json", bytes: 12, sha256: "bad" },
        { path: "artifacts/acquisition/external.json", bytes: 12, sha256: "0".repeat(64) },
      ]) {
        const fixture = writeExternalFixture(root, { artifact });
        const result = verifyDataRoomManifest(manifest([{
          ...fixture.entry,
          status: "present",
          receiptVerified: true,
        }]), {
          rootDir: root,
          expectedCommitSha: HEAD,
          catalog: [fixture.entry],
        });
        expect(result.integrityPassed).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("materializes valid, declared, unsafe, missing, and release-bound evidence states", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-materialize-"));
    try {
      mkdirSync(join(root, "evidence"), { recursive: true });
      writeFileSync(join(root, "evidence", "value.txt"), "abc");
      const local = fileEntry();
      const external = externalEntry();
      const declared = materializeDataRoomManifest({
        rootDir: root,
        manifestPath: "manifest.json",
        commitSha: HEAD,
        releaseTag: "v1.2.3",
        releaseCommitSha: RELEASE,
        generatedAt: "2026-08-07T00:00:00.000Z",
        catalog: [local, external, commandEntry()],
      });
      expect(declared.release).toEqual({ tag: "v1.2.3", commitSha: RELEASE });
      expect(declared.entries.map((entry) => entry.status)).toEqual(["present", "declared", "present"]);
      expect(declared.finalGatePassed).toBe(false);

      writeExternalFixture(root);
      const verified = materializeDataRoomManifest({
        rootDir: root,
        manifestPath: "manifest.json",
        commitSha: HEAD,
        catalog: [external],
      });
      expect(verified.entries[0].status).toBe("present");
      expect(verified.entries[0].receiptVerified).toBe(true);

      writeFileSync(join(root, String(external.receiptPath)), "{");
      const unsafe = materializeDataRoomManifest({
        rootDir: root,
        manifestPath: "manifest.json",
        commitSha: HEAD,
        catalog: [external],
      });
      expect(unsafe.entries[0].status).toBe("unsafe");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid materialization commit identities", () => {
    expect(() => materializeDataRoomManifest({
      commitSha: "not-a-sha",
      catalog: [commandEntry()],
    })).toThrow("commitSha must be the exact 40-character audited Git commit");
    expect(() => materializeDataRoomManifest({
      commitSha: null as never,
      catalog: [commandEntry()],
    })).toThrow("commitSha must be the exact 40-character audited Git commit");
  });

  it("does not accept oversized manifest files", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-integrity-oversized-json-"));
    try {
      const path = join(root, "manifest.json");
      writeFileSync(path, "x".repeat(MAX_DATA_ROOM_JSON_BYTES + 1));
      const result = verifyDataRoomManifestFile(path, {
        expectedCommitSha: HEAD,
        catalog: [commandEntry()],
      });
      expect(result.integrityPassed).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
