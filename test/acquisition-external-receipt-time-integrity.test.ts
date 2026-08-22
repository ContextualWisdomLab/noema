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
const catalog = [{
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

function writeReceipt(root: string, collectedAt: string) {
  const artifactPath = join(root, catalog[0].artifactPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, "immutable design export\n");
  const bytes = readFileSync(artifactPath);
  const receiptPath = join(root, catalog[0].receiptPath);
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, JSON.stringify({
    schemaVersion: 1,
    repository: DATA_ROOM_REPOSITORY,
    source: { commitSha: HEAD },
    sourceUrl: catalog[0].url,
    collectedAt,
    collector: "cwl-acquisition-evidence",
    provenance: "manual immutable export retained in the acquisition data room",
    artifact: {
      path: catalog[0].artifactPath,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    },
  }));
}

function manifest() {
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
      ...catalog[0],
      status: "present",
      receiptVerified: true,
    }],
  };
}

describe("external acquisition receipt time integrity", () => {
  it("rejects a future-dated immutable external receipt", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-data-room-future-receipt-"));
    try {
      writeReceipt(root, "2099-01-01T00:00:00.000Z");
      const result = verifyDataRoomManifest(manifest(), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog,
      });

      expect(result.integrityPassed).toBe(false);
      expect(result.finalGatePassed).toBe(false);
      expect(result.failures).toContain("design-evidence receipt does not authenticate the retained external artifact");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves a canonical non-future external receipt", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-data-room-past-receipt-"));
    try {
      writeReceipt(root, "2026-08-07T00:00:00.000Z");
      const result = verifyDataRoomManifest(manifest(), {
        rootDir: root,
        expectedCommitSha: HEAD,
        catalog,
      });

      expect(result.integrityPassed).toBe(true);
      expect(result.finalGatePassed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
