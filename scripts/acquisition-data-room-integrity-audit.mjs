#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyDataRoomManifestFile } from "./lib/acquisition-data-room-integrity.mjs";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const now = new Date().toISOString();
const outputDir = process.env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const manifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH
  || join(outputDir, "data-room-manifest.json");
const auditPath = join(outputDir, "data-room-integrity-audit.json");

/** Resolve a Git revision to one exact commit before it can authorize evidence. */
function resolveCommit(ref) {
  const value = execFileSync(
    "git",
    ["rev-parse", "--verify", `${ref}^{commit}`],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 4096,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    },
  ).trim();
  if (!fullShaPattern.test(value)) {
    throw new TypeError(`Git ref ${ref} did not resolve to an exact commit SHA.`);
  }
  return value.toLowerCase();
}

/** Bind the audit to the checked-out commit and refuse a conflicting explicit expectation. */
function expectedSourceCommit() {
  const head = resolveCommit("HEAD");
  const supplied = String(process.env.NOEMA_DATA_ROOM_SOURCE_COMMIT || "").trim().toLowerCase();
  if (supplied && supplied !== head) {
    throw new Error("NOEMA_DATA_ROOM_SOURCE_COMMIT does not match the exact checked-out HEAD.");
  }
  return head;
}

/** Resolve an optional immutable release selection to its exact commit. */
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
    expectedReleaseCommitSha: resolveCommit(tag),
  };
}

try {
  const expectedCommitSha = expectedSourceCommit();
  const release = expectedRelease();
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

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(auditPath, `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
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
  writeFileSync(auditPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: now,
    manifestPath,
    integrityPassed: false,
    finalGatePassed: false,
    failures: [failure],
  }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.error("acquisition-data-room-integrity: FAIL");
  console.error(`reason=${failure}`);
  process.exitCode = 1;
}
