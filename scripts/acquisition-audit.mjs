#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyAcquisitionTrackedCheckout } from "./lib/acquisition-git-preflight.mjs";

const stages = [
  ["npm", "release:dependency-license-inventory"],
  ["npm", "acquisition:manifest"],
  ["npm", "acquisition:integrity"],
  ["node", "scripts/acquisition-readiness-audit.mjs"],
  ["npm", "acquisition:deployment-evidence"],
];

function checkedSpawn(command, args, options) {
  const result = spawnSync(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`acquisition audit stage exited ${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

function resolveHeadRevision(cwd) {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (git.error) throw git.error;
  if (git.status !== 0) throw new Error("git rev-parse HEAD failed");
  return git.stdout.trim();
}

function canonicalRevision(value) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)) {
    throw new Error("one full commit SHA is required");
  }
  return value.toLowerCase();
}

export function runAcquisitionAudit({
  cwd = process.cwd(),
  env = process.env,
  spawn = checkedSpawn,
  revision,
  resolveRevision,
} = {}) {
  const requireLiveSource = revision === undefined;
  const liveRevision = resolveRevision ?? (() => resolveHeadRevision(cwd));
  const expectedRevision = canonicalRevision(
    requireLiveSource ? liveRevision() : revision,
  );

  const outputDirectory = env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
    || env.NOEMA_DATA_ROOM_OUTPUT_DIR
    || join(cwd, "artifacts", "acquisition-readiness", expectedRevision);
  const stageEnv = {
    ...env,
    NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDirectory,
    NOEMA_DATA_ROOM_OUTPUT_DIR: outputDirectory,
    NOEMA_DATA_ROOM_SOURCE_COMMIT: expectedRevision,
  };
  const npmExecPath = env.npm_execpath;
  if (!npmExecPath) throw new Error("npm_execpath is required");

  const assertLiveSource = () => {
    if (!requireLiveSource) return;
    if (canonicalRevision(liveRevision()) !== expectedRevision) {
      throw new Error("acquisition audit source revision changed during execution");
    }
    if (resolveRevision === undefined) {
      verifyAcquisitionTrackedCheckout({
        cwd,
        expectedCommitSha: expectedRevision,
      });
    }
  };

  for (const [runtime, name] of stages) {
    assertLiveSource();
    const args = runtime === "npm" ? [npmExecPath, "run", name] : [name];
    let stageError = null;
    try {
      spawn(process.execPath, args, { cwd, env: stageEnv, stdio: "inherit" });
    } catch (error) {
      stageError = error;
    }
    assertLiveSource();
    if (stageError) throw stageError;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    runAcquisitionAudit();
  } catch (error) {
    if (Number.isInteger(error?.exitCode)) {
      process.exitCode = error.exitCode;
    } else {
      throw error;
    }
  }
}
