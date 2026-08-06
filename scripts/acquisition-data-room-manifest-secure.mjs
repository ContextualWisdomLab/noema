#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { materializeDataRoomManifest } from "./lib/acquisition-data-room-integrity.mjs";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const now = new Date().toISOString();
const outputDir = process.env.NOEMA_DATA_ROOM_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const manifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH
  || join(outputDir, "data-room-manifest.json");

/** Resolve one Git revision to an exact commit with bounded, non-interactive Git execution. */
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

/** Resolve an explicitly supplied commit or bind the manifest to the checked-out HEAD. */
function resolveSourceCommit() {
  const supplied = String(process.env.NOEMA_DATA_ROOM_SOURCE_COMMIT || "").trim();
  if (!supplied) {
    return resolveCommit("HEAD");
  }
  if (!fullShaPattern.test(supplied)) {
    throw new TypeError("NOEMA_DATA_ROOM_SOURCE_COMMIT must be a full commit SHA.");
  }
  const checkedOut = resolveCommit("HEAD");
  if (supplied.toLowerCase() !== checkedOut) {
    throw new Error("NOEMA_DATA_ROOM_SOURCE_COMMIT does not match the exact checked-out HEAD.");
  }
  return checkedOut;
}

/** Resolve the selected immutable release tag, or return an empty release binding. */
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
    releaseCommitSha: resolveCommit(tag),
  };
}

try {
  const commitSha = resolveSourceCommit();
  const release = resolveRelease();
  const output = materializeDataRoomManifest({
    rootDir: process.cwd(),
    manifestPath,
    commitSha,
    ...release,
    generatedAt: now,
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
