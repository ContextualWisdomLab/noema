import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const commitSha = "a".repeat(40);
const tag = "v0.1.0";
const expectedAssets = [
  "SHA256SUMS",
  "cyclonedx-sbom.sigstore.json",
  "noema.cdx.json",
  `noema-${commitSha}.tar.gz`,
  "provenance.sigstore.json",
  "release-evidence.json",
].sort();

function runReleaseAudit(assetBytes: unknown) {
  const root = mkdtempSync(join(tmpdir(), "noema-acquisition-release-bytes-"));
  const receiptPath = join(root, "release-publication-receipt.json");
  const outputDir = join(root, "audit");
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("NOEMA_")),
  );
  const assets = expectedAssets.map((name) => ({
    name,
    sha256: "b".repeat(64),
    apiDigest: `sha256:${"b".repeat(64)}`,
    bytes: assetBytes,
  }));
  writeFileSync(receiptPath, JSON.stringify({
    schemaVersion: 1,
    source: {
      repository: "ContextualWisdomLab/noema",
      tag,
      commitSha,
      version: "0.1.0",
    },
    immutableReleasePolicy: { enabled: true },
    release: {
      immutable: true,
      tagName: tag,
      resolvedTagCommitSha: commitSha,
    },
    verification: {
      releaseVerified: true,
      resolvedTagCommitSha: commitSha,
      workflowRunUrl: "https://github.com/ContextualWisdomLab/noema/actions/runs/123",
      verifiedAssets: expectedAssets,
    },
    assets,
  }));

  const result = spawnSync(process.execPath, ["scripts/acquisition-readiness-audit.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...inheritedEnvironment,
      NOEMA_AUDIT_REPORT_ONLY: "1",
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
      NOEMA_RELEASE_UNDER_DILIGENCE_TAG: tag,
      NOEMA_RELEASE_PUBLICATION_RECEIPT_PATH: receiptPath,
      NOEMA_REVENUE_EVIDENCE_PATH: join(root, "missing-revenue.json"),
      NOEMA_TRANSFER_EVIDENCE_PATH: join(root, "missing-transfer.json"),
      NOEMA_PILOT_LOG_PATH: join(root, "missing-pilot.md"),
      NOEMA_SALEABLE_AUDIT_PATH: join(root, "missing-saleable.json"),
      NOEMA_DATA_ROOM_MANIFEST_PATH: join(root, "missing-data-room.json"),
    },
  });
  const audit = JSON.parse(readFileSync(join(outputDir, "acquisition-audit.json"), "utf8"));
  const releaseCheck = audit.checks.find(
    (check: { name: string }) => check.name === "release publication receipt pass",
  );
  rmSync(root, { recursive: true, force: true });
  return { result, releaseCheck };
}

describe("acquisition release asset byte authority", () => {
  it("rejects string byte sizes instead of coercing untyped release evidence", () => {
    const { releaseCheck } = runReleaseAudit("1");

    expect(releaseCheck.pass).toBe(false);
    expect(releaseCheck.details.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("byte size invalid")]),
    );
  });

  it("accepts a canonical positive safe-integer byte size", () => {
    const { releaseCheck } = runReleaseAudit(1);

    expect(releaseCheck.pass).toBe(true);
    expect(releaseCheck.details.failures).toEqual([]);
  });
});
