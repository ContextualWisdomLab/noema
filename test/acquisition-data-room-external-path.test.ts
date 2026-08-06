import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_ROOM_OBJECTIVE,
  DATA_ROOM_REPOSITORY,
  DATA_ROOM_SCHEMA_VERSION,
  verifyDataRoomManifest,
} from "../scripts/lib/acquisition-data-room-integrity.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const externalCatalog = [{
  id: "design-evidence",
  category: "product",
  kind: "external",
  url: "https://example.com/design",
  receiptPath: "artifacts/acquisition/design-evidence-receipt.json",
  artifactPath: "artifacts/acquisition/design-evidence-export.json",
  required: false,
  requiredForFinalGate: true,
}] as const;

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function receiptPath(root: string) {
  return join(root, "artifacts", "acquisition", "design-evidence-receipt.json");
}

function writeReceipt(root: string, artifactPath: string) {
  const absoluteArtifact = join(root, artifactPath);
  mkdirSync(dirname(absoluteArtifact), { recursive: true });
  writeFileSync(absoluteArtifact, "immutable design export\n");
  const bytes = readFileSync(absoluteArtifact);
  const outputPath = receiptPath(root);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({
    schemaVersion: 1,
    repository: DATA_ROOM_REPOSITORY,
    source: { commitSha: HEAD },
    sourceUrl: "https://example.com/design",
    collectedAt: "2026-08-07T00:00:00.000Z",
    collector: "cwl-acquisition-evidence",
    provenance: "manual immutable export retained in the acquisition data room",
    artifact: {
      path: artifactPath,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    },
  }));
}

function manifest(catalogEntry = externalCatalog[0]) {
  return {
    schemaVersion: DATA_ROOM_SCHEMA_VERSION,
    repository: DATA_ROOM_REPOSITORY,
    objective: DATA_ROOM_OBJECTIVE,
    source: { commitSha: HEAD },
    passed: true,
    finalGatePassed: true,
    missingRequired: [],
    missingFinalGate: [],
    entries: [{
      ...catalogEntry,
      status: "present",
      receiptVerified: true,
    }],
  };
}

describe("external acquisition evidence allowlist", () => {
  it("rejects a valid receipt that authenticates an unreviewed retained path", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-data-room-external-path-"));
    try {
      writeReceipt(root, "README.md");
      const result = verifyDataRoomManifest(manifest(), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: externalCatalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.finalGatePassed).toBe(false);
      expect(result.failures).toContain("design-evidence receipt does not authenticate the reviewed retained artifact path");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an external catalog whose retained artifact path is not canonical", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-data-room-invalid-reviewed-path-"));
    const unsafeEntry = {
      ...externalCatalog[0],
      artifactPath: "../design-evidence-export.json",
    };
    try {
      const result = verifyDataRoomManifest(manifest(unsafeEntry), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: [unsafeEntry],
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.finalGatePassed).toBe(false);
      expect(result.failures).toContain("design-evidence reviewed retained artifact path is not canonical");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a receipt that omits its retained artifact identity", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-data-room-missing-artifact-"));
    try {
      writeReceipt(root, externalCatalog[0].artifactPath);
      writeFileSync(receiptPath(root), JSON.stringify({
        schemaVersion: 1,
        repository: DATA_ROOM_REPOSITORY,
        source: { commitSha: HEAD },
        sourceUrl: externalCatalog[0].url,
        collectedAt: "2026-08-07T00:00:00.000Z",
        collector: "cwl-acquisition-evidence",
        provenance: "manual immutable export retained in the acquisition data room",
      }));

      const result = verifyDataRoomManifest(manifest(), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: externalCatalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.finalGatePassed).toBe(false);
      expect(result.failures).toContain("design-evidence receipt does not authenticate the reviewed retained artifact path");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the same receipt contract only at the catalog-pinned retained path", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-data-room-reviewed-path-"));
    try {
      writeReceipt(root, externalCatalog[0].artifactPath);
      const result = verifyDataRoomManifest(manifest(), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog: externalCatalog,
      });

      expect(result.integrityPassed).toBe(true);
      expect(result.finalGatePassed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
