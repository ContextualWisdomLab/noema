#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  resolveAcquisitionCommit,
  verifyAcquisitionTrackedCheckout,
} from "./lib/acquisition-git-preflight.mjs";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const now = new Date().toISOString();
const outputDir = process.env.NOEMA_DATA_ROOM_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const manifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH
  || join(outputDir, "data-room-manifest.json");

/** Bind an optional caller expectation to the already authenticated checkout. */
function resolveSourceCommit(authenticatedHead) {
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

/** Resolve the selected immutable release tag from the same local-only Git trust root. */
function resolveRelease() {
  const tag = String(process.env.NOEMA_RELEASE_UNDER_DILIGENCE_TAG || "").trim();
  if (!tag) {
    return { releaseTag: "", releaseCommitSha: "" };
  }
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new TypeError("NOEMA_RELEASE_UNDER_DILIGENCE_TAG must be an immutable SemVer tag.");
  }
  return {
    releaseTag: tag,
    releaseCommitSha: resolveAcquisitionCommit(tag, { cwd: process.cwd() }),
  };
}

try {
  const authenticatedHead = verifyAcquisitionTrackedCheckout({ cwd: process.cwd() });
  const commitSha = resolveSourceCommit(authenticatedHead);
  const release = resolveRelease();

  // The verifier/catalog module is intentionally loaded only after the tracked
  // checkout has been authenticated against exact HEAD. The small preflight
  // module and this entrypoint are the bootstrap trust root executed by CI.
  const { materializeDataRoomManifest } = await import("./lib/acquisition-data-room-integrity.mjs");
  const output = materializeDataRoomManifest({
    rootDir: process.cwd(),
    manifestPath,
    commitSha,
    ...release,
    generatedAt: now,
  });

  // Refuse source movement or tracked mutation that occurred while evidence was
  // read. Intentionally untracked retained acquisition artifacts remain valid.
  verifyAcquisitionTrackedCheckout({
    cwd: process.cwd(),
    expectedCommitSha: commitSha,
  });

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log(`acquisition-data-room-manifest: ${output.passed ? "PASS" : "FAIL"}`);
  console.log(`manifest_file=${manifestPath}`);
  console.log(`source_commit=${commitSha}`);
  if (output.missingFinalGate.length > 0) {
    console.log("Missing final-gate evidence:");
    output.missingFinalGate.forEach((id) => console.log(`- ${id}`));
  }
  console.log("Final-gate validation: run npm run acquisition:audit after evidence files are present");
  if (!output.passed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("acquisition-data-room-manifest: FAIL");
  console.error(`reason=${error instanceof Error ? error.message : "unknown_error"}`);
  process.exitCode = 1;
}
