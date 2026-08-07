import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const MAX_GIT_OUTPUT_BYTES = 4096;
const MAX_GIT_INDEX_OUTPUT_BYTES = 2 * 1024 * 1024;
const GIT_TIMEOUT_MS = 10_000;

/**
 * Build the bounded environment used for acquisition-readiness Git reads.
 * Global/system configuration, replacement objects, lazy fetches, hooks,
 * filesystem monitors, and terminal prompts are disabled so the preflight is
 * local-only and cannot silently change the object graph or execute helpers.
 * The exact command working directory is admitted only through a command-scoped
 * safe.directory entry and is also pinned as GIT_WORK_TREE, preventing a
 * repository-local core.worktree setting from redirecting tracked-byte checks
 * away from the checkout whose acquisition evidence is being audited.
 *
 * Git's ordinary worktree comparison can trust cached size and mtime values.
 * Repository-local core.trustctime, core.checkStat, core.ignoreStat, or
 * core.filemode settings could otherwise suppress same-size byte or executable
 * mode drift. Command-scoped values restore the strict comparison policy before
 * any exact-head evidence is accepted.
 */
export function buildAcquisitionGitEnvironment(
  sourceEnvironment = process.env,
  platform = process.platform,
  cwd = process.cwd(),
) {
  const nullDevice = platform === "win32" ? "NUL" : "/dev/null";
  const exactWorkTree = resolve(cwd);
  const environment = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_ATTR_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_WORK_TREE: exactWorkTree,
    GIT_CONFIG_COUNT: "8",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: nullDevice,
    GIT_CONFIG_KEY_1: "core.fsmonitor",
    GIT_CONFIG_VALUE_1: "false",
    GIT_CONFIG_KEY_2: "core.untrackedCache",
    GIT_CONFIG_VALUE_2: "false",
    GIT_CONFIG_KEY_3: "safe.directory",
    GIT_CONFIG_VALUE_3: exactWorkTree,
    GIT_CONFIG_KEY_4: "core.trustctime",
    GIT_CONFIG_VALUE_4: "true",
    GIT_CONFIG_KEY_5: "core.checkStat",
    GIT_CONFIG_VALUE_5: "default",
    GIT_CONFIG_KEY_6: "core.ignoreStat",
    GIT_CONFIG_VALUE_6: "false",
    GIT_CONFIG_KEY_7: "core.filemode",
    GIT_CONFIG_VALUE_7: "true",
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
  maximumOutputBytes = MAX_GIT_OUTPUT_BYTES,
) {
  const commandCwd = cwd ?? process.cwd();
  const result = spawnSyncImpl("git", args, {
    cwd: commandCwd,
    env: buildAcquisitionGitEnvironment(sourceEnvironment, platform, commandCwd),
    encoding: "utf8",
    maxBuffer: maximumOutputBytes,
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

function requireCleanComparison(result, exactHead) {
  if (result.status === 1) {
    throw new Error(`tracked checkout differs from exact HEAD ${exactHead}`);
  }
  if (result.status !== 0) {
    throw new Error("acquisition tracked-checkout comparison failed");
  }
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
 * Refuse index hints that can intentionally suppress worktree comparison.
 * `git ls-files -v -z` emits `S` for skip-worktree and lower-case tags for
 * assume-unchanged entries. The complete NUL-delimited result is bounded to
 * 2 MiB and malformed output fails closed without reflecting repository paths.
 */
export function verifyAcquisitionIndexFlags(options = {}) {
  const result = runGit(
    ["ls-files", "-v", "-z", "--cached", "--"],
    options,
    MAX_GIT_INDEX_OUTPUT_BYTES,
  );
  if (result.status !== 0) {
    throw new Error("acquisition Git index inspection failed");
  }
  const output = String(result.stdout ?? "");
  if (output.length === 0) {
    return;
  }
  if (!output.endsWith("\0")) {
    throw new Error("acquisition Git index inspection returned malformed output");
  }
  for (const record of output.slice(0, -1).split("\0")) {
    if (record.length < 3 || record[1] !== " ") {
      throw new Error("acquisition Git index inspection returned malformed output");
    }
    const tag = record[0];
    if (tag === "S" || (tag >= "a" && tag <= "z")) {
      throw new Error("unsafe Git index flag detected in acquisition checkout");
    }
  }
}

/**
 * Authenticate the tracked checkout against its exact HEAD without treating
 * intentionally untracked retained acquisition artifacts as source drift.
 * Unsafe index hints are rejected before and after the comparison, the Git
 * worktree is bound to the audited cwd, staged state is compared to exact HEAD
 * without consulting worktree filters, and `git diff-files` checks worktree
 * state against that index without invoking repository-configured clean
 * filters. Exact HEAD is resolved before and after all tracked-state checks so
 * redirected, helper-influenced, or concurrently moved source cannot be
 * labelled as that commit.
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

  verifyAcquisitionIndexFlags(options);
  const stagedComparison = runGit(
    [
      "diff",
      "--cached",
      "--quiet",
      "--no-ext-diff",
      "--no-textconv",
      "--ignore-submodules=none",
      exactHead,
      "--",
    ],
    options,
  );
  requireCleanComparison(stagedComparison, exactHead);

  const worktreeComparison = runGit(
    [
      "diff-files",
      "--quiet",
      "--no-ext-diff",
      "--no-textconv",
      "--ignore-submodules=none",
      "--",
    ],
    options,
  );
  requireCleanComparison(worktreeComparison, exactHead);
  verifyAcquisitionIndexFlags(options);

  const afterHead = resolveAcquisitionCommit("HEAD", options);
  if (afterHead !== exactHead) {
    throw new Error("exact HEAD changed during acquisition Git preflight");
  }
  return exactHead;
}
