import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { resolve, sep } from "node:path";

const fullShaPattern = /^[0-9a-f]{40}$/i;
const fullObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const indexHeaderPattern = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])$/;
const MAX_GIT_OUTPUT_BYTES = 4096;
const MAX_GIT_INDEX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_TRACKED_ENTRY_COUNT = 20_000;
const MAX_TRACKED_PATH_BYTES = 4096;
const MAX_TRACKED_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TRACKED_TOTAL_BYTES = 256 * 1024 * 1024;
const GIT_TIMEOUT_MS = 10_000;
const supportedTrackedModes = new Set(["100644", "100755"]);
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const defaultFileSystem = Object.freeze({
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
});

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
 * depth, while a separate descriptor-bound blob comparison authenticates the
 * exact bytes even when same-size drift is hidden by a cached stat tuple.
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
  outputEncoding = "utf8",
) {
  const commandCwd = cwd ?? process.cwd();
  const result = spawnSyncImpl("git", args, {
    cwd: commandCwd,
    env: buildAcquisitionGitEnvironment(sourceEnvironment, platform, commandCwd),
    encoding: outputEncoding,
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

function safeRegularMetadata(metadata) {
  return Boolean(
    metadata
      && typeof metadata.isFile === "function"
      && typeof metadata.isSymbolicLink === "function"
      && metadata.isFile()
      && !metadata.isSymbolicLink(),
  );
}

function asOutputBuffer(output) {
  if (Buffer.isBuffer(output)) {
    return output;
  }
  if (output === null || output === undefined) {
    return Buffer.alloc(0);
  }
  if (typeof output === "string") {
    return Buffer.from(output, "utf8");
  }
  if (ArrayBuffer.isView(output)) {
    return Buffer.from(output.buffer, output.byteOffset, output.byteLength);
  }
  throw new Error("acquisition tracked-byte index returned malformed output");
}

function decodeTrackedPath(pathBytes) {
  if (pathBytes.length === 0) {
    throw new Error("acquisition tracked-byte index returned malformed output");
  }
  try {
    return fatalUtf8Decoder.decode(pathBytes);
  } catch {
    throw new Error("acquisition tracked-byte index path must be valid UTF-8");
  }
}

function parseTrackedEntries(output, cwd) {
  const bytes = asOutputBuffer(output);
  if (bytes.length === 0) {
    return [];
  }
  if (bytes[bytes.length - 1] !== 0) {
    throw new Error("acquisition tracked-byte index returned malformed output");
  }
  const records = [];
  let recordStart = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) {
      continue;
    }
    records.push(bytes.subarray(recordStart, index));
    recordStart = index + 1;
    if (records.length > MAX_TRACKED_ENTRY_COUNT) {
      throw new Error("acquisition tracked-byte index exceeds the entry limit");
    }
  }

  const root = resolve(cwd);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  let pathBytesTotal = 0;
  return records.map((record) => {
    const separatorIndex = record.indexOf(0x09);
    if (separatorIndex <= 0) {
      throw new Error("acquisition tracked-byte index returned malformed output");
    }
    const headerBytes = record.subarray(0, separatorIndex);
    if (headerBytes.some((byte) => byte > 0x7f)) {
      throw new Error("acquisition tracked-byte index returned malformed output");
    }
    const match = indexHeaderPattern.exec(headerBytes.toString("ascii"));
    if (!match) {
      throw new Error("acquisition tracked-byte index returned malformed output");
    }
    const [, mode, objectId, stage] = match;
    if (stage !== "0") {
      throw new Error("acquisition tracked-byte index contains an unmerged entry");
    }
    if (!supportedTrackedModes.has(mode)) {
      throw new Error("acquisition tracked-byte index contains an unsupported object mode");
    }

    const pathBytes = record.subarray(separatorIndex + 1);
    pathBytesTotal += pathBytes.length;
    if (pathBytes.length > MAX_TRACKED_PATH_BYTES || pathBytesTotal > MAX_GIT_INDEX_OUTPUT_BYTES) {
      throw new Error("acquisition tracked-byte index exceeds the path limit");
    }
    const path = decodeTrackedPath(pathBytes);
    const absolutePath = resolve(root, path);
    if (absolutePath === root || !absolutePath.startsWith(rootPrefix)) {
      throw new Error("acquisition tracked-byte index contains an unsafe path");
    }
    return { mode, objectId: objectId.toLowerCase(), path, absolutePath };
  });
}

function requireExecutableMode(entry, metadata) {
  if (!Number.isInteger(metadata.mode)) {
    throw new Error("tracked checkout object type differs from its authenticated Git index");
  }
  const expectedExecutable = entry.mode === "100755";
  const actualExecutable = (metadata.mode & 0o100) !== 0;
  if (expectedExecutable !== actualExecutable) {
    throw new Error("tracked checkout executable mode differs from its authenticated Git index");
  }
}

function readTrackedRegularBytes(entry, fileSystem, remainingBytes) {
  const readOnly = fileSystem.constants?.O_RDONLY;
  const noFollow = fileSystem.constants?.O_NOFOLLOW;
  if (!Number.isInteger(readOnly) || !Number.isInteger(noFollow)) {
    throw new Error("acquisition tracked-byte authentication requires no-follow filesystem support");
  }

  const beforePath = fileSystem.lstatSync(entry.absolutePath);
  if (!safeRegularMetadata(beforePath)) {
    throw new Error("tracked checkout object type differs from its authenticated Git index");
  }

  const descriptor = fileSystem.openSync(entry.absolutePath, readOnly | noFollow);
  try {
    const beforeDescriptor = fileSystem.fstatSync(descriptor);
    if (!safeRegularMetadata(beforeDescriptor) || !sameTrackedMetadata(beforePath, beforeDescriptor)) {
      throw new Error("tracked checkout changed before raw-byte authentication");
    }
    requireExecutableMode(entry, beforeDescriptor);

    const byteSize = beforeDescriptor.size;
    if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_TRACKED_FILE_BYTES) {
      throw new Error("tracked checkout exceeds the acquisition file-byte limit");
    }
    if (byteSize > remainingBytes) {
      throw new Error("tracked checkout exceeds the acquisition aggregate-byte limit");
    }

    const contents = Buffer.alloc(byteSize + 1);
    let offset = 0;
    while (offset < contents.length) {
      const bytesRead = fileSystem.readSync(
        descriptor,
        contents,
        offset,
        contents.length - offset,
        null,
      );
      if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > contents.length - offset) {
        throw new Error("acquisition tracked-byte descriptor returned an invalid byte count");
      }
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }

    const afterDescriptor = fileSystem.fstatSync(descriptor);
    const afterPath = fileSystem.lstatSync(entry.absolutePath);
    if (
      offset !== byteSize
      || !sameTrackedMetadata(beforeDescriptor, afterDescriptor)
      || !sameTrackedMetadata(afterDescriptor, afterPath)
    ) {
      throw new Error("tracked checkout changed during raw-byte authentication");
    }
    return contents.subarray(0, offset);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

function hashTrackedEntry(entry, options, fileSystem, remainingBytes) {
  const input = readTrackedRegularBytes(entry, fileSystem, remainingBytes);
  const result = runGit(["hash-object", "--stdin"], { ...options, input });
  if (result.status !== 0) {
    throw new Error("acquisition tracked-byte hashing failed");
  }
  const objectId = String(result.stdout ?? "").trim().toLowerCase();
  if (!fullObjectPattern.test(objectId)) {
    throw new Error("acquisition tracked-byte hashing returned malformed output");
  }
  if (objectId !== entry.objectId) {
    throw new Error("tracked checkout differs from its authenticated Git index bytes");
  }
  return input.length;
}

/**
 * Recompute every tracked regular-file Git blob object from descriptor-bound
 * checkout bytes. Production callers must provide the already-resolved exact
 * HEAD, causing the expected object inventory to come from immutable
 * `git ls-tree` output rather than mutable index state. The legacy index listing
 * remains only as an injected-spawn test seam for focused parser and descriptor
 * unit tests and cannot be reached by a production call using the real Git
 * process without an exact immutable tree identity.
 *
 * Every file is opened with O_NOFOLLOW, bound to pre/post path and descriptor
 * metadata, read through that descriptor with limit+1 growth detection, and
 * hashed through standard input. Executable mode is checked independently.
 *
 * The source listing, path count, path bytes, per-file bytes, and aggregate
 * bytes are bounded before each read. Symbolic links, gitlinks, sparse
 * directories, path escape, malformed output, descriptor movement, growth,
 * invalid UTF-8, and hash mismatch fail closed without accepting cached stat
 * equality or a second pathname open as byte evidence.
 */
export function verifyAcquisitionTrackedBytes({
  cwd = process.cwd(),
  exactHead = "",
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
  if (!exactHead && spawnSyncImpl === spawnSync) {
    throw new TypeError(
      "exact acquisition tree commit is required for production tracked-byte authentication",
    );
  }
  if (exactHead && !fullShaPattern.test(exactHead)) {
    throw new TypeError("exact acquisition tree commit must be a full Git SHA");
  }
  const listingArgs = exactHead
    ? [
      "ls-tree",
      "-r",
      "--full-tree",
      "-z",
      "--format=%(objectmode) %(objectname) 0%x09%(path)",
      exactHead.toLowerCase(),
      "--",
    ]
    : ["ls-files", "--stage", "-z", "--cached", "--"];
  const listing = runGit(
    listingArgs,
    options,
    MAX_GIT_INDEX_OUTPUT_BYTES,
    null,
  );
  if (listing.status !== 0) {
    throw new Error("acquisition tracked-byte source inspection failed");
  }
  const entries = parseTrackedEntries(listing.stdout, cwd);
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
 * from descriptor-bound raw checkout bytes against the immutable exact HEAD
 * tree rather than trusting mutable stage-zero object IDs. Exact HEAD is
 * resolved before and after all checks so redirected, helper-influenced,
 * stat-cache-hidden, raced, or concurrently moved source cannot be labelled as
 * that commit.
 *
 * `spawnSyncImpl` is a test seam that already controls every Git identity and
 * comparison result. Production callers do not replace it; real execution adds
 * the descriptor-bound raw-byte pass described above.
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
    verifyAcquisitionTrackedBytes({ ...options, exactHead });
  }
  verifyAcquisitionIndexFlags(options);

  const afterHead = resolveAcquisitionCommit("HEAD", options);
  if (afterHead !== exactHead) {
    throw new Error("exact HEAD changed during acquisition Git preflight");
  }
  return exactHead;
}
