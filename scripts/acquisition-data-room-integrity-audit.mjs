#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  resolveAcquisitionCommit,
  verifyAcquisitionTrackedCheckout,
} from "./lib/acquisition-git-preflight.mjs";
import {
  assertAcquisitionPrivatePathParents,
  writeAcquisitionPrivateFile,
} from "./lib/acquisition-private-output.mjs";

const fullShaPattern = /^[0-9a-f]{40}$/;
const now = new Date().toISOString();
const configuredOutputDir = process.env.NOEMA_DATA_ROOM_OUTPUT_DIR
  || process.env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
  || "";
const configuredManifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH || "";
let outputDir = configuredOutputDir
  || join(process.cwd(), "artifacts", "acquisition-readiness", "failed");
let manifestPath = configuredManifestPath
  || join(outputDir, "data-room-manifest.json");
let auditPath = join(outputDir, "data-room-integrity-audit.json");

/** Bind an optional caller expectation to the already authenticated checkout. */
function expectedSourceCommit(authenticatedHead) {
  const supplied = String(process.env.NOEMA_DATA_ROOM_SOURCE_COMMIT || "");
  if (!supplied) {
    return authenticatedHead;
  }
  if (!fullShaPattern.test(supplied)) {
    throw new TypeError("NOEMA_DATA_ROOM_SOURCE_COMMIT must be an exact lowercase full commit SHA.");
  }
  if (supplied !== authenticatedHead) {
    throw new Error("NOEMA_DATA_ROOM_SOURCE_COMMIT does not match the exact checked-out HEAD.");
  }
  return authenticatedHead;
}

/** Resolve an optional immutable release selection through the local-only Git trust root. */
function expectedRelease() {
  const tag = String(process.env.NOEMA_RELEASE_UNDER_DILIGENCE_TAG || "");
  if (!tag) {
    return { expectedReleaseTag: "", expectedReleaseCommitSha: "" };
  }
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new TypeError("NOEMA_RELEASE_UNDER_DILIGENCE_TAG must use exact canonical SemVer bytes.");
  }
  return {
    expectedReleaseTag: tag,
    expectedReleaseCommitSha: resolveAcquisitionCommit(tag, { cwd: process.cwd() }),
  };
}

/** Create the audit output directory only through a non-symlink parent chain. */
function preparePrivateOutputDirectory() {
  const boundaryProbe = join(outputDir, ".noema-output-boundary");
  assertAcquisitionPrivatePathParents(boundaryProbe);
  mkdirSync(outputDir, { recursive: true });
  assertAcquisitionPrivatePathParents(boundaryProbe);
}

/** Persist an audit report through the no-follow owner-only output boundary. */
function writePrivateAudit(value) {
  writeAcquisitionPrivateFile(auditPath, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  const authenticatedHead = verifyAcquisitionTrackedCheckout({ cwd: process.cwd() });
  const expectedCommitSha = expectedSourceCommit(authenticatedHead);
  if (!configuredOutputDir) {
    outputDir = join(process.cwd(), "artifacts", "acquisition-readiness", expectedCommitSha);
  }
  if (!configuredManifestPath) {
    manifestPath = join(outputDir, "data-room-manifest.json");
  }
  auditPath = join(outputDir, "data-room-integrity-audit.json");
  const release = expectedRelease();

  // Load the catalog/verifier only after the exact tracked checkout preflight.
  // This entrypoint, the small Git preflight module, and the private-output
  // helper are the CI bootstrap trust root; retained data-room artifacts remain
  // untrusted.
  const { verifyDataRoomManifestFile } = await import("./lib/acquisition-data-room-integrity.mjs");
  const { DATA_ROOM_CATALOG } = await import("./lib/acquisition-data-room-catalog.mjs");
  const result = verifyDataRoomManifestFile(manifestPath, {
    rootDir: process.cwd(),
    expectedCommitSha,
    ...release,
    catalog: DATA_ROOM_CATALOG,
  });
  const output = {
    schemaVersion: 1,
    generatedAt: now,
    manifestPath,
    expectedCommitSha,
    expectedReleaseTag: release.expectedReleaseTag || null,
    expectedReleaseCommitSha: release.expectedReleaseCommitSha || null,
    ...result,
  };

  // Re-authenticate after all retained evidence was read so a source change
  // during verification cannot be emitted as exact-commit-bound evidence.
  verifyAcquisitionTrackedCheckout({
    cwd: process.cwd(),
    expectedCommitSha,
  });

  preparePrivateOutputDirectory();
  writePrivateAudit(output);
  console.log(`acquisition-data-room-integrity: ${result.integrityPassed ? "PASS" : "FAIL"}`);
  console.log(`audit_file=${auditPath}`);
  console.log(`exact_commit=${expectedCommitSha}`);
  console.log(`trusted_final_gate=${result.finalGatePassed ? "PASS" : "NOT_READY"}`);
  if (!result.integrityPassed) {
    result.failures.forEach((failure) => console.log(`- ${failure}`));
    process.exitCode = 1;
  }
} catch (error) {
  const failure = error instanceof Error ? error.message : "unknown_error";
  try {
    preparePrivateOutputDirectory();
    writePrivateAudit({
      schemaVersion: 1,
      generatedAt: now,
      manifestPath,
      integrityPassed: false,
      finalGatePassed: false,
      failures: [failure],
    });
  } catch (writeError) {
    console.error(`audit_write_failure=${writeError instanceof Error ? writeError.message : "unknown_error"}`);
  }
  console.error("acquisition-data-room-integrity: FAIL");
  console.error(`reason=${failure}`);
  process.exitCode = 1;
}
