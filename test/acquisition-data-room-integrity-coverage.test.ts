import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it, vi } from "vitest";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OTHER_HEAD = "89abcdef0123456789abcdef0123456789abcdef";

function commandEntry() {
  return {
    id: "verify-command",
    category: "automation",
    kind: "command",
    command: "npm run release:verify",
    required: true,
    requiredForFinalGate: true,
  };
}

function fileEntry() {
  return {
    id: "file-evidence",
    category: "security",
    kind: "file",
    path: "evidence/missing.txt",
    required: true,
    requiredForFinalGate: true,
  };
}

function externalEntry() {
  return {
    id: "external-evidence",
    category: "product",
    kind: "external",
    url: "https://example.invalid/evidence",
    receiptPath: "artifacts/acquisition/external-receipt.json",
    artifactPath: "artifacts/acquisition/external.json",
    required: false,
    requiredForFinalGate: true,
  };
}

function exactManifest(constants: {
  DATA_ROOM_SCHEMA_VERSION: number;
  DATA_ROOM_REPOSITORY: string;
  DATA_ROOM_OBJECTIVE: string;
}, entries: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: constants.DATA_ROOM_SCHEMA_VERSION,
    repository: constants.DATA_ROOM_REPOSITORY,
    objective: constants.DATA_ROOM_OBJECTIVE,
    source: { commitSha: HEAD },
    passed: true,
    finalGatePassed: true,
    missingRequired: [],
    missingFinalGate: [],
    entries,
    ...overrides,
  };
}

describe.sequential("acquisition data-room integrity coverage guards", () => {
  it("delegates a valid retained manifest file to trusted recomputation", async () => {
    vi.doUnmock("node:path");
    vi.resetModules();
    const integrity = await import("../scripts/lib/acquisition-data-room-integrity.mjs");
    const root = mkdtempSync(nodePath.join(tmpdir(), "noema-valid-manifest-"));
    try {
      const catalog = [commandEntry()];
      const manifest = exactManifest(integrity, [{ ...catalog[0], status: "present" }]);
      const path = nodePath.join(root, "manifest.json");
      writeFileSync(path, `${JSON.stringify(manifest)}\n`);

      const result = integrity.verifyDataRoomManifestFile(path, {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog,
      });

      expect(result.integrityPassed).toBe(true);
      expect(result.finalGatePassed).toBe(true);
      expect(result.failures).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("covers every fail-closed source-commit identity branch", async () => {
    vi.doUnmock("node:path");
    vi.resetModules();
    const integrity = await import("../scripts/lib/acquisition-data-room-integrity.mjs");
    const catalog = [commandEntry()];
    const entry = { ...catalog[0], status: "present" };

    const missingExpected = integrity.verifyDataRoomManifest(
      exactManifest(integrity, [entry]),
      { expectedCommitSha: null as never, catalog },
    );
    expect(missingExpected.failures).toContain("source.commitSha must match the exact audited commit");

    const missingSource = integrity.verifyDataRoomManifest(
      exactManifest(integrity, [entry], { source: undefined }),
      { expectedCommitSha: HEAD, catalog },
    );
    expect(missingSource.failures).toContain("source.commitSha must match the exact audited commit");

    const mismatchedSource = integrity.verifyDataRoomManifest(
      exactManifest(integrity, [entry]),
      { expectedCommitSha: OTHER_HEAD, catalog },
    );
    expect(mismatchedSource.failures).toContain("source.commitSha must match the exact audited commit");
  });

  it("cross-checks every persisted missing-file field without short-circuit blind spots", async () => {
    vi.doUnmock("node:path");
    vi.resetModules();
    const integrity = await import("../scripts/lib/acquisition-data-room-integrity.mjs");
    const root = mkdtempSync(nodePath.join(tmpdir(), "noema-missing-file-state-"));
    try {
      const catalog = [fileEntry()];
      const baseOverrides = {
        passed: false,
        finalGatePassed: false,
        missingRequired: [catalog[0].id],
        missingFinalGate: [catalog[0].id],
      };
      const persistedStates = [
        { status: "present", bytes: null, sha256: null, shouldFail: true },
        { status: "missing", bytes: 1, sha256: null, shouldFail: true },
        { status: "missing", bytes: null, sha256: "0".repeat(64), shouldFail: true },
        { status: "missing", bytes: null, sha256: null, shouldFail: false },
      ];

      for (const state of persistedStates) {
        const manifest = exactManifest(
          integrity,
          [{
            ...catalog[0],
            status: state.status,
            bytes: state.bytes,
            sha256: state.sha256,
          }],
          baseOverrides,
        );
        const result = integrity.verifyDataRoomManifest(manifest, {
          rootDir: root,
          expectedCommitSha: HEAD,
          catalog,
        });
        expect(result.failures.includes("file-evidence persisted file status does not match retained evidence"))
          .toBe(state.shouldFail);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when an external receipt exists conceptually but cannot be inspected", async () => {
    vi.doUnmock("node:path");
    vi.resetModules();
    const integrity = await import("../scripts/lib/acquisition-data-room-integrity.mjs");
    const root = mkdtempSync(nodePath.join(tmpdir(), "noema-receipt-denied-"));
    try {
      const catalog = [externalEntry()];
      const manifest = exactManifest(
        integrity,
        [{ ...catalog[0], status: "declared", receiptVerified: false }],
        {
          finalGatePassed: false,
          missingFinalGate: [catalog[0].id],
        },
      );
      const denied = Object.assign(new Error("permission denied"), { code: "EACCES" });
      const fileSystem = {
        constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
        lstatSync: vi.fn(() => {
          throw denied;
        }),
        openSync: vi.fn(),
        fstatSync: vi.fn(),
        readSync: vi.fn(),
        closeSync: vi.fn(),
      };

      const result = integrity.verifyDataRoomManifest(manifest, {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog,
        fileSystem,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.failures).toContain("external-evidence receipt is unreadable or unsafe");
      expect(fileSystem.openSync).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retains lexical root-escape defenses even after component canonicality checks", async () => {
    vi.resetModules();
    vi.doMock("node:path", async () => {
      const actual = await vi.importActual<typeof import("node:path")>("node:path");
      return {
        ...actual,
        relative: vi.fn((from: string, to: string) => {
          switch (actual.basename(to)) {
            case "parent-escape.txt":
              return "..";
            case "child-escape.txt":
              return `..${actual.sep}escape`;
            case "absolute-escape.txt":
              return actual.resolve(actual.sep, "escape");
            default:
              return actual.relative(from, to);
          }
        }),
      };
    });

    const integrity = await import("../scripts/lib/acquisition-data-room-integrity.mjs");
    const root = mkdtempSync(nodePath.join(tmpdir(), "noema-path-guard-"));
    try {
      mkdirSync(nodePath.join(root, "safe"), { recursive: true });
      const catalog = [
        {
          id: "parent-escape",
          category: "security",
          kind: "file",
          path: "parent-escape.txt",
          required: false,
          requiredForFinalGate: false,
        },
        {
          id: "child-escape",
          category: "security",
          kind: "file",
          path: "child-escape.txt",
          required: false,
          requiredForFinalGate: false,
        },
        {
          id: "absolute-escape",
          category: "security",
          kind: "file",
          path: "absolute-escape.txt",
          required: false,
          requiredForFinalGate: false,
        },
        {
          id: "safe-missing",
          category: "security",
          kind: "file",
          path: "safe/missing.txt",
          required: false,
          requiredForFinalGate: false,
        },
      ];

      const output = integrity.materializeDataRoomManifest({
        rootDir: root,
        manifestPath: "unused.json",
        commitSha: HEAD,
        catalog,
      });

      expect(output.entries.map((entry: { status: string }) => entry.status)).toEqual([
        "unsafe",
        "unsafe",
        "unsafe",
        "missing",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
      vi.doUnmock("node:path");
      vi.resetModules();
    }
  });
});
