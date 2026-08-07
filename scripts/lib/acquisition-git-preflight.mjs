import { spawnSync } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { resolve, sep } from "node:path";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const fullObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const indexEntryPattern = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t([\s\S]+)$/;
const MAX_GIT_OUTPUT_BYTES = 4096;
const MAX_GIT_INDEX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_TRACKED_ENTRY_COUNT = 20_000;
const MAX_TRACKED_PATH_BYTES = 4096;
const MAX_TRACKED_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TRACKED_TOTAL_BYTES = 256 * 1024 * 1024;
const GIT_TIMEOUT_MS = 10_000;
const supportedTrackedModes = new Set(["100644", "100755", "120000"]);
const defaultFileSystem = Object.freeze({ lstatSync, readlinkSync });

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
 * Git's ordinary worktree comparison can trust cached filesystem metadata.
 * Command-scoped stat settings restore strict normal comparison as defence in
 * depth, while a separate raw blob-object comparison authenticates bytes even
 * when same-size content drift is hidden by a cached stat tuple.
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
    input,
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
    input,
    maxBuffer: maximumOutputBytes,
    timeout: GIT_TIMEOUT_MS,
    stdio: ["pipe", "pipe", "pipe"],
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

function sameTrackedMetadata(left, right) {
  return Boolean(
    left
      && right
      && left.dev === right.dev
      && left.ino === right.ino
      && left.mode === right.mode
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs
      && left.ctimeMs === right.ctimeMs,
  );
}

function parseTrackedEntries(output, cwd) {
  if (output.length === 0) {
    return [];
  }
  if (!output.endsWith("\0")) {
    throw new Error("acquisition tracked-byte index returned malformed output");
  }
  const records = output.slice(0, -1).split("\0");
  if (records.length > MAX_TRACKED_ENTRY_COUNT) {
    throw new Error("acquisition tracked-byte index exceeds the entry limit");
  }
  const root = resolve(cwd);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  let pathBytes = 0;
  return records.map((record) => {
    const match = indexEntryPattern.exec(record);
    if (!match) {
      throw new Error("acquisition tracked-byte index returned malformed output");
    }
    const [, mode, objectId, stage, path] = match;
    if (stage !== "0") {
      throw new Error("acquisition tracked-byte index contains an unmerged entry");
    }
    if (!supportedTrackedModes.has(mode)) {
      throw new Error("acquisition tracked-byte index contains an unsupported object mode");
    }
    const currentPathBytes = Buffer.byteLength(path, "utf8");
    pathBytes += currentPathBytes;
    if (currentPathBytes > MAX_TRACKED_PATH_BYTES || pathBytes > MAX_GIT_INDEX_OUTPUT_BYTES) {
      throw new Error("acquisition tracked-byte index exceeds the path limit");
    }
    const absolutePath = resolve(root, path);
    if (absolutePath === root || !absolutePath.startsWith(rootPrefix)) {
      throw new Error("acquisition tracked-byte index contains an unsafe path");
    }
    return { mode, objectId: objectId.toLowerCase(), path, absolutePath };
  });
}

function hashTrackedEntry(entry, options, fileSystem, remainingBytes) {
  const before = fileSystem.lstatSync(entry.absolutePath);
  let byteSize;
  let hashArgs;
  let input;
  if (entry.mode === "120000") {
    if (typeof before.isSymbolicLink !== "function" || !before.isSymbolicLink()) {
      throw new Error("tracked checkout object type differs from its authenticated Git index");
    }
    input = fileSystem.readlinkSync(entry.absolutePath, { encoding: "buffer" });
    byteSize = input.length;
    hashArgs = ["hash-object", "--stdin"];
  } else {
    if (
      typeof before.isFile !== "function"
      || typeof before.isSymbolicLink !== "function"
      || !before.isFile()
      || before.isSymbolicLink()
    ) {
      throw new Error("tracked checkout object type differs from its authenticated Git index");
    }
    byteSize = before.size;
    hashArgs = ["hash-object", "--no-filters", "--", entry.path];
  }
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_TRACKED_FILE_BYTES) {
    throw new Error("tracked checkout exceeds the acquisition file-byte limit");
  }
  if (byteSize > remainingBytes) {
    throw new Error("tracked checkout exceeds the acquisition aggregate-byte limit");
  }
  const result = runGit(hashArgs, { ...options, input });
  if (result.status !== 0) {
    throw new Error("acquisition tracked-byte hashing failed");
  }
  const objectId = String(result.stdout ?? "").trim().toLowerCase();
  if (!fullObjectPattern.test(objectId)) {
    throw new Error("acquisition tracked-byte hashing returned malformed output");
  }
  const after = fileSystem.lstatSync(entry.absolutePath);
  if (!sameTrackedMetadata(before, after)) {
    throw new Error("tracked checkout changed during raw-byte authentication");
  }
  if (objectId !== entry.objectId) {
    throw new Error("tracked checkout differs from its authenticated Git index bytes");
  }
  return byteSize;
}

/**
 * Recompute every tracked regular-file or symbolic-link Git blob object from
 * the current checkout and compare it with the stage-zero index object ID.
 * The index listing, path count, path bytes, per-file bytes, and aggregate bytes
 * are bounded before each hash read. Git filters are disabled for regular files;
 * symbolic-link target bytes are hashed through stdin. Gitlinks, sparse
 * directories, unmerged stages, path escape, malformed output, metadata
 * movement, and hash mismatch fail closed without accepting cached stat equality
 * as byte evidence.
 */
export function verifyAcquisitionTrackedBytes({
  cwd = process.cwd(),
  spawnSyncImpl = spawnSync,
  sourceEnvironment = process.env,
  platform = process.platform,
  fileSystem = defaultFileSystem,
} = {}) {
  const options = {
    cwd,
    spawnSyncImpl,
    sourceEnvironment,
    platform,
  };
  const listing = runGit(
    ["ls-files", "--stage", "-z", "--cached", "--"],
    options,
    MAX_GIT_INDEX_OUTPUT_BYTES,
  );
  if (listing.status !== 0) {
    throw new Error("acquisition tracked-byte index inspection failed");
  }
  const entries = parseTrackedEntries(String(listing.stdout ?? ""), cwd);
  let aggregateBytes = 0;
  for (const entry of entries) {
    aggregateBytes += hashTrackedEntry(
      entry,
      options,
      fileSystem,
      MAX_TRACKED_TOTAL_BYTES - aggregateBytes,
    );
  }
  return entries.length;
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
 * Unsafe index hints are rejected before and after the comparison, staged state
 * is compared to exact HEAD, ordinary worktree comparison remains defence in
 * depth, and production execution independently recomputes every tracked blob
 * from raw checkout bytes. Exact HEAD is resolved before and after all checks so
 * redirected, helper-influenced, stat-cache-hidden, or concurrently moved source
 * cannot be labelled as that commit.
 *
 * `spawnSyncImpl` is a test seam that already controls every Git identity and
 * comparison result. Production callers do not replace it; real execution adds
 * the raw-byte pass described above.
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
  if (spawnSyncImpl === spawnSync) {
    verifyAcquisitionTrackedBytes(options);
  }
  verifyAcquisitionIndexFlags(options);

  const afterHead = resolveAcquisitionCommit("HEAD", options);
  if (afterHead !== exactHead) {
    throw new Error("exact HEAD changed during acquisition Git preflight");
  }
  return exactHead;
}
