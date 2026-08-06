#!/usr/bin/env node
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveAcquisitionCommit,
  verifyAcquisitionTrackedCheckout,
} from "./lib/acquisition-git-preflight.mjs";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const now = new Date().toISOString();
const outputDir = process.env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const manifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH
  || join(outputDir, "data-room-manifest.json");
const auditPath = join(outputDir, "data-room-integrity-audit.json");

/** Bind an optional caller expectation to the already authenticated checkout. */
function expectedSourceCommit(authenticatedHead) {
  const supplied = String(process.env.NOEMA_DATA_ROOM_SOURCE_COMMIT || "").trim();
  if (!supplied) {
    return authenticatedHead;
  }
  if (!fullShaPattern.test(supplied)) {
    throw new TypeError("NOEMA_DATA_ROOM_SOURCE_COMMIT must be a full commit SHA.");
  }
  if (supplied.toLowerCase() !== authenticatedHead) {
    throw new Error("NOEMA_DATA_ROOM_SOURCE_COMMIT does not match the exact checked-out HEAD.");
  }
  return authenticatedHead;
}

/** Resolve an optional immutable release selection through the local-only Git trust root. */
function expectedRelease() {
  const tag = String(process.env.NOEMA_RELEASE_UNDER_DILIGENCE_TAG || "").trim();
  if (!tag) {
    return { expectedReleaseTag: "", expectedReleaseCommitSha: "" };
  }
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new TypeError("NOEMA_RELEASE_UNDER_DILIGENCE_TAG must be an immutable SemVer tag.");
  }
  return {
    expectedReleaseTag: tag,
    expectedReleaseCommitSha: resolveAcquisitionCommit(tag, { cwd: process.cwd() }),
  };
}

/** Persist an audit report and enforce owner-only permissions even on an existing path. */
function writePrivateAudit(value) {
  writeFileSync(auditPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(auditPath, 0o600);
}

try {
  const authenticatedHead = verifyAcquisitionTrackedCheckout({ cwd: process.cwd() });
  const expectedCommitSha = expectedSourceCommit(authenticatedHead);
  const release = expectedRelease();

  // Load the catalog/verifier only after the exact tracked checkout preflight.
  // This entrypoint and the small Git preflight module are the CI bootstrap
  // trust root; retained data-room artifacts themselves remain untrusted.
  const { verifyDataRoomManifestFile } = await import("./lib/acquisition-data-room-integrity.mjs");
  const result = verifyDataRoomManifestFile(manifestPath, {
    rootDir: process.cwd(),
    expectedCommitSha,
    ...release,
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

  mkdirSync(outputDir, { recursive: true });
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
  mkdirSync(outputDir, { recursive: true });
  const failure = error instanceof Error ? error.message : "unknown_error";
  writePrivateAudit({
    schemaVersion: 1,
    generatedAt: now,
    manifestPath,
    integrityPassed: false,
    finalGatePassed: false,
    failures: [failure],
  });
  console.error("acquisition-data-room-integrity: FAIL");
  console.error(`reason=${failure}`);
  process.exitCode = 1;
}
