import { spawnSync } from "node:child_process";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const MAX_GIT_OUTPUT_BYTES = 4096;
const GIT_TIMEOUT_MS = 10_000;

/**
 * Build the bounded environment used for acquisition-readiness Git reads.
 * Global/system configuration, replacement objects, lazy fetches, hooks,
 * filesystem monitors, and terminal prompts are disabled so the preflight is
 * local-only and cannot silently change the object graph or execute helpers.
 */
export function buildAcquisitionGitEnvironment(
  sourceEnvironment = process.env,
  platform = process.platform,
) {
  const nullDevice = platform === "win32" ? "NUL" : "/dev/null";
  const environment = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_ATTR_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: nullDevice,
    GIT_CONFIG_KEY_1: "core.fsmonitor",
    GIT_CONFIG_VALUE_1: "false",
    GIT_CONFIG_KEY_2: "core.untrackedCache",
    GIT_CONFIG_VALUE_2: "false",
  };
  if (typeof sourceEnvironment.PATH === "string" && sourceEnvironment.PATH.length > 0) {
    environment.PATH = sourceEnvironment.PATH;
  }
  if (
    platform === "win32"
    && typeof sourceEnvironment.SystemRoot === "string"
    && sourceEnvironment.SystemRoot.length > 0
  ) {
    environment.SystemRoot = sourceEnvironment.SystemRoot;
  }
  return environment;
}

function runGit(
  args,
  {
    cwd,
    spawnSyncImpl = spawnSync,
    sourceEnvironment = process.env,
    platform = process.platform,
  },
) {
  const result = spawnSyncImpl("git", args, {
    cwd,
    env: buildAcquisitionGitEnvironment(sourceEnvironment, platform),
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`acquisition Git preflight failed: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`acquisition Git preflight terminated by signal ${result.signal}`);
  }
  if (!Number.isInteger(result.status)) {
    throw new Error("acquisition Git preflight returned no exit status");
  }
  return result;
}

/**
 * Resolve a local Git revision to one exact 40-character commit. The command
 * uses only the local object database and refuses malformed or ambiguous
 * output rather than allowing an approximate source identity.
 */
export function resolveAcquisitionCommit(
  ref,
  options = {},
) {
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 256 || /[\u0000-\u001f\u007f]/.test(ref)) {
    throw new TypeError("acquisition Git ref must be a bounded printable string");
  }
  const result = runGit(
    ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
    options,
  );
  if (result.status !== 0) {
    throw new Error(`acquisition Git ref ${ref} could not be resolved locally`);
  }
  const output = String(result.stdout ?? "").trim();
  if (!fullShaPattern.test(output)) {
    throw new Error(`acquisition Git ref ${ref} did not resolve to one exact commit`);
  }
  return output.toLowerCase();
}

/**
 * Authenticate the tracked checkout against its exact HEAD without treating
 * intentionally untracked retained acquisition artifacts as source drift.
 * The exact HEAD is resolved before and after the diff so concurrent branch
 * movement or worktree mutation cannot be silently labelled as that commit.
 */
export function verifyAcquisitionTrackedCheckout({
  cwd = process.cwd(),
  expectedCommitSha = "",
  spawnSyncImpl = spawnSync,
  sourceEnvironment = process.env,
  platform = process.platform,
} = {}) {
  const options = {
    cwd,
    spawnSyncImpl,
    sourceEnvironment,
    platform,
  };
  const exactHead = resolveAcquisitionCommit("HEAD", options);
  if (expectedCommitSha) {
    if (!fullShaPattern.test(expectedCommitSha)) {
      throw new TypeError("expected acquisition commit must be a full Git SHA");
    }
    if (exactHead !== expectedCommitSha.toLowerCase()) {
      throw new Error("exact HEAD changed from the expected acquisition commit");
    }
  }

  const diff = runGit(
    [
      "diff",
      "--quiet",
      "--no-ext-diff",
      "--no-textconv",
      "--ignore-submodules=none",
      exactHead,
      "--",
    ],
    options,
  );
  if (diff.status === 1) {
    throw new Error(`tracked checkout differs from exact HEAD ${exactHead}`);
  }
  if (diff.status !== 0) {
    throw new Error("acquisition tracked-checkout comparison failed");
  }

  const afterHead = resolveAcquisitionCommit("HEAD", options);
  if (afterHead !== exactHead) {
    throw new Error("exact HEAD changed during acquisition Git preflight");
  }
  return exactHead;
}
