#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function runAcquisitionAudit({
  cwd = process.cwd(),
  env = process.env,
  spawn = checkedSpawn,
  revision,
} = {}) {
  if (revision === undefined) {
    const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
    if (git.error) throw git.error;
    if (git.status !== 0) throw new Error("git rev-parse HEAD failed");
    revision = git.stdout.trim();
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision)) {
    throw new Error("one full commit SHA is required");
  }
  const canonicalRevision = revision.toLowerCase();

  const outputDirectory = env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
    || env.NOEMA_DATA_ROOM_OUTPUT_DIR
    || join(cwd, "artifacts", "acquisition-readiness", canonicalRevision);
  const stageEnv = {
    ...env,
    NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDirectory,
    NOEMA_DATA_ROOM_OUTPUT_DIR: outputDirectory,
    NOEMA_DATA_ROOM_SOURCE_COMMIT: canonicalRevision,
  };
  const npmExecPath = env.npm_execpath;
  if (!npmExecPath) throw new Error("npm_execpath is required");

  for (const [runtime, name] of stages) {
    const args = runtime === "npm" ? [npmExecPath, "run", name] : [name];
    spawn(process.execPath, args, { cwd, env: stageEnv, stdio: "inherit" });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runAcquisitionAudit();
}
