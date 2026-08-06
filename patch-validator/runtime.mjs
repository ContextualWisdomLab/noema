import {
  O_CREAT,
  O_EXCL,
  O_NOFOLLOW,
  O_TRUNC,
  O_WRONLY,
} from "node:constants";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, posix, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

export const MAX_PATCH_BYTES = 4 * 1024 * 1024;
export const MAX_CHANGED_FILES = 100;
export const MAX_SOURCE_MEMBERS = 20_000;
export const MAX_SOURCE_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_SOURCE_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_RESULT_JSON_BYTES = 16 * 1024;
export const MAX_RESULT_EXCERPT_CHARS = 4_000;
export const MAX_RESULT_DURATION_MS = 1_200_000;
export const COMMAND_TIMEOUT_MS = 1_200_000;
export const COMMAND_OUTPUT_BYTES = 4_000;

const PROFILE = "node_patch_verify";
const COMMAND_PROFILE = "node_patch_verify_v1";
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HUNK_HEADER =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/;
const INDEX_LINE = /^index [0-9a-fA-F]{4,64}\.\.[0-9a-fA-F]{4,64}(?: 100(?:644|755))?$/;
const NEW_FILE_MODE = /^new file mode (100644|100755)$/;
const DELETED_FILE_MODE = /^deleted file mode (100644|100755)$/;
const FORBIDDEN_PATHS = new Set([
  ".npmrc",
  ".node-version",
  "Dockerfile.patch-validator",
  "Dockerfile.patch-validator.dockerignore",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
]);
const FORBIDDEN_PREFIXES = [
  ".git/",
  ".github/",
  "node_modules/",
  "patch-validator/",
  "reviewer/",
];
const UNSUPPORTED_METADATA_PREFIXES = [
  "copy from ",
  "copy to ",
  "new mode ",
  "old mode ",
  "rename from ",
  "rename to ",
  "similarity index ",
  "dissimilarity index ",
];
const decoder = new TextDecoder("utf-8", { fatal: true });

function boundedExcerpt(value, maximum = MAX_RESULT_EXCERPT_CHARS) {
  const text = String(value ?? "");
  return text.length <= maximum ? text : text.slice(0, maximum);
}

function decodeUtf8(bytes, label) {
  try {
    return decoder.decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8`, { cause: error });
  }
}

export function validateRepositoryPath(rawPath) {
  if (
    typeof rawPath !== "string" ||
    rawPath.length === 0 ||
    isAbsolute(rawPath) ||
    rawPath.startsWith("/") ||
    rawPath.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(rawPath)
  ) {
    throw new Error("patch contains an unsafe repository path");
  }
  const parts = rawPath.split("/");
  if (
    parts.some((part) => part === "" || part === "." || part === "..") ||
    posix.normalize(rawPath) !== rawPath
  ) {
    throw new Error("patch contains a noncanonical repository path");
  }
  if (
    rawPath === ".git" ||
    rawPath === "node_modules" ||
    FORBIDDEN_PATHS.has(rawPath) ||
    FORBIDDEN_PREFIXES.some((prefix) => rawPath.startsWith(prefix))
  ) {
    throw new Error(`patch-validator profile forbids path: ${rawPath}`);
  }
  return rawPath;
}

function parseDiffHeader(line) {
  let match = /^diff --git a\/([^\s]+) b\/([^\s]+)$/u.exec(line);
  if (match === null) {
    match = /^diff --git "a\/([^"\\]+)" "b\/([^"\\]+)"$/u.exec(line);
  }
  if (match === null) {
    throw new Error("patch contains a malformed diff header");
  }
  const sourcePath = validateRepositoryPath(match[1]);
  const targetPath = validateRepositoryPath(match[2]);
  if (sourcePath !== targetPath) {
    throw new Error(
      "patch-validator profile does not support path-changing operations",
    );
  }
  return targetPath;
}

function parseFileHeader(line, marker, prefix) {
  if (!line.startsWith(marker)) {
    throw new Error("patch contains incomplete file path metadata");
  }
  const rawPath = line.slice(marker.length);
  if (rawPath === "/dev/null") {
    return null;
  }
  let candidate = rawPath;
  if (candidate.startsWith('"') && candidate.endsWith('"')) {
    candidate = candidate.slice(1, -1);
  }
  if (!candidate.startsWith(prefix)) {
    throw new Error("patch contains malformed file path metadata");
  }
  return validateRepositoryPath(candidate.slice(prefix.length));
}

function parseHunk(lines, startIndex) {
  const match = HUNK_HEADER.exec(lines[startIndex]);
  if (match === null) {
    throw new Error("patch contains a malformed hunk header");
  }
  const oldStart = Number(match[1]);
  const oldCount = Number(match[2] ?? "1");
  const newStart = Number(match[3]);
  const newCount = Number(match[4] ?? "1");
  let oldRemaining = oldCount;
  let newRemaining = newCount;
  let index = startIndex + 1;
  const hunkLines = [];

  while (oldRemaining > 0 || newRemaining > 0) {
    const line = lines[index];
    if (line === undefined || line.length === 0) {
      throw new Error("patch hunk ended before its declared line counts");
    }
    const marker = line[0];
    let kind;
    if (marker === " ") {
      kind = "context";
      oldRemaining -= 1;
      newRemaining -= 1;
    } else if (marker === "-") {
      kind = "delete";
      oldRemaining -= 1;
    } else if (marker === "+") {
      kind = "add";
      newRemaining -= 1;
    } else {
      throw new Error("patch contains a malformed hunk body");
    }
    if (oldRemaining < 0 || newRemaining < 0) {
      throw new Error("patch hunk contains more lines than declared");
    }
    const parsedLine = {
      kind,
      text: line.slice(1),
      oldNoNewline: false,
      newNoNewline: false,
    };
    index += 1;
    if (lines[index] === "\\ No newline at end of file") {
      parsedLine.oldNoNewline = kind !== "add";
      parsedLine.newNoNewline = kind !== "delete";
      index += 1;
    }
    hunkLines.push(parsedLine);
  }

  return {
    hunk: {
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: hunkLines,
    },
    nextIndex: index,
  };
}

export function parseUnifiedPatch(patchBytes) {
  if (!Buffer.isBuffer(patchBytes) || patchBytes.length === 0) {
    throw new Error("patch must be a nonempty byte buffer");
  }
  if (patchBytes.length > MAX_PATCH_BYTES) {
    throw new Error("patch exceeds its byte limit");
  }
  const text = decodeUtf8(patchBytes, "patch");
  if (text.includes("GIT binary patch") || text.includes("Binary files ")) {
    throw new Error("patch contains an unsupported binary payload");
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const patches = [];
  const observedPaths = new Set();
  let index = 0;

  while (index < lines.length) {
    const path = parseDiffHeader(lines[index]);
    if (observedPaths.has(path)) {
      throw new Error(`patch repeats duplicate target path: ${path}`);
    }
    observedPaths.add(path);
    if (observedPaths.size > MAX_CHANGED_FILES) {
      throw new Error("patch changes too many files");
    }
    index += 1;

    let newMode = null;
    let deletedMode = null;
    while (index < lines.length && !lines[index].startsWith("--- ")) {
      const metadata = lines[index];
      if (INDEX_LINE.test(metadata)) {
        index += 1;
        continue;
      }
      const newModeMatch = NEW_FILE_MODE.exec(metadata);
      if (newModeMatch !== null) {
        newMode = newModeMatch[1];
        index += 1;
        continue;
      }
      const deletedModeMatch = DELETED_FILE_MODE.exec(metadata);
      if (deletedModeMatch !== null) {
        deletedMode = deletedModeMatch[1];
        index += 1;
        continue;
      }
      if (
        UNSUPPORTED_METADATA_PREFIXES.some((prefix) =>
          metadata.startsWith(prefix),
        )
      ) {
        throw new Error("patch contains unsupported profile metadata");
      }
      throw new Error("patch contains unbound metadata before file headers");
    }

    const oldPath = parseFileHeader(lines[index] ?? "", "--- ", "a/");
    index += 1;
    const newPath = parseFileHeader(lines[index] ?? "", "+++ ", "b/");
    index += 1;
    if (oldPath !== null && oldPath !== path) {
      throw new Error("patch source header does not match its primary path");
    }
    if (newPath !== null && newPath !== path) {
      throw new Error("patch target header does not match its primary path");
    }
    if (oldPath === null && newPath === null) {
      throw new Error("patch cannot create and delete the same null path");
    }

    let operation = "modify";
    let mode = null;
    if (oldPath === null) {
      operation = "create";
      mode = newMode ?? "100644";
      if (deletedMode !== null) {
        throw new Error("patch contains conflicting creation metadata");
      }
    } else if (newPath === null) {
      operation = "delete";
      mode = deletedMode;
      if (newMode !== null) {
        throw new Error("patch contains conflicting deletion metadata");
      }
    } else if (newMode !== null || deletedMode !== null) {
      throw new Error("patch contains misplaced file-mode metadata");
    }

    const hunks = [];
    while (index < lines.length && lines[index].startsWith("@@")) {
      const parsed = parseHunk(lines, index);
      hunks.push(parsed.hunk);
      index = parsed.nextIndex;
    }
    if (hunks.length === 0) {
      throw new Error("patch file section contains no hunks");
    }
    if (index < lines.length && !lines[index].startsWith("diff --git ")) {
      throw new Error("patch contains unbound trailing syntax");
    }
    patches.push({ path, operation, mode, hunks });
  }

  if (patches.length === 0) {
    throw new Error("patch contains no diff headers");
  }
  return patches;
}

function splitFileText(text) {
  if (text.length === 0) {
    return [];
  }
  const chunks = text.split("\n");
  const hasFinalNewline = text.endsWith("\n");
  if (hasFinalNewline) {
    chunks.pop();
  }
  return chunks.map((chunk, index) => ({
    text: chunk,
    newline: hasFinalNewline || index < chunks.length - 1,
  }));
}

function joinFileLines(lines) {
  return lines.map((line) => `${line.text}${line.newline ? "\n" : ""}`).join("");
}

function safeTargetPath(root, repositoryPath, createParents) {
  const canonical = validateRepositoryPath(repositoryPath);
  const absoluteRoot = resolve(root);
  const target = resolve(root, canonical);
  if (!target.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error("patch target escapes the private source root");
  }
  let current = absoluteRoot;
  const parents = canonical.split("/").slice(0, -1);
  for (const component of parents) {
    current = join(current, component);
    if (!existsSync(current)) {
      if (!createParents) {
        throw new Error("patch source has a missing parent directory");
      }
      mkdirSync(current, { mode: 0o700 });
      continue;
    }
    const metadata = lstatSync(current);
    if (metadata.isSymbolicLink()) {
      throw new Error("patch target parent must not be a symlink");
    }
    if (!metadata.isDirectory()) {
      throw new Error("patch target parent must be a directory");
    }
  }
  return target;
}

function readSourceFile(path) {
  if (!existsSync(path)) {
    throw new Error("patch operation has a missing source file");
  }
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("patch source must be a regular non-symlink file");
  }
  if (metadata.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error("patch source file exceeds its byte limit");
  }
  const bytes = readFileSync(path);
  return {
    lines: splitFileText(decodeUtf8(bytes, "patch source file")),
    mode: metadata.mode & 0o111 ? 0o755 : 0o644,
  };
}

function applyHunks(sourceLines, hunks) {
  const output = [];
  let sourceCursor = 0;
  for (const hunk of hunks) {
    const oldIndex = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
    const newIndex = hunk.newStart === 0 ? 0 : hunk.newStart - 1;
    if (oldIndex < sourceCursor || oldIndex > sourceLines.length) {
      throw new Error("patch hunk old range is inconsistent with the source");
    }
    output.push(...sourceLines.slice(sourceCursor, oldIndex));
    if (output.length !== newIndex) {
      throw new Error("patch hunk new range is inconsistent with prior hunks");
    }
    sourceCursor = oldIndex;

    for (const line of hunk.lines) {
      if (line.kind === "add") {
        output.push({ text: line.text, newline: !line.newNoNewline });
        continue;
      }
      const sourceLine = sourceLines[sourceCursor];
      if (sourceLine === undefined || sourceLine.text !== line.text) {
        throw new Error("patch context does not match the authenticated source");
      }
      if (sourceLine.newline !== !line.oldNoNewline) {
        throw new Error("patch newline marker does not match the source");
      }
      sourceCursor += 1;
      if (line.kind === "context") {
        output.push({ text: line.text, newline: !line.newNoNewline });
      }
    }
  }
  output.push(...sourceLines.slice(sourceCursor));
  return output;
}

function writeAtomicFile(path, bytes, mode) {
  const temporary = `${path}.noema-${randomUUID()}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, O_CREAT | O_EXCL | O_WRONLY, mode);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, mode);
    renameSync(temporary, path);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
    rmSync(temporary, { force: true });
    throw error;
  }
}

export function applyPatchSet(root, patches) {
  for (const patch of patches) {
    const createParents = patch.operation === "create";
    const target = safeTargetPath(root, patch.path, createParents);
    if (patch.operation === "create") {
      if (existsSync(target)) {
        throw new Error("patch create target already exists");
      }
      const output = applyHunks([], patch.hunks);
      const bytes = Buffer.from(joinFileLines(output), "utf8");
      if (bytes.length > MAX_SOURCE_FILE_BYTES) {
        throw new Error("patched file exceeds its byte limit");
      }
      writeAtomicFile(target, bytes, patch.mode === "100755" ? 0o755 : 0o644);
      continue;
    }

    const source = readSourceFile(target);
    const output = applyHunks(source.lines, patch.hunks);
    if (patch.operation === "delete") {
      if (output.length !== 0) {
        throw new Error("patch deletion did not consume the complete source file");
      }
      unlinkSync(target);
      continue;
    }
    const bytes = Buffer.from(joinFileLines(output), "utf8");
    if (bytes.length > MAX_SOURCE_FILE_BYTES) {
      throw new Error("patched file exceeds its byte limit");
    }
    writeAtomicFile(target, bytes, source.mode);
  }
}

export function copySourceTree(
  sourceRoot,
  destinationRoot,
  {
    maximumMembers = MAX_SOURCE_MEMBERS,
    maximumFileBytes = MAX_SOURCE_FILE_BYTES,
    maximumTotalBytes = MAX_SOURCE_TOTAL_BYTES,
  } = {},
) {
  mkdirSync(destinationRoot, { recursive: true, mode: 0o700 });
  let members = 0;
  let totalBytes = 0;

  function copyDirectory(source, destination, isRoot) {
    for (const name of readdirSync(source).sort()) {
      if (isRoot && name === ".git") {
        continue;
      }
      const sourcePath = join(source, name);
      const destinationPath = join(destination, name);
      const metadata = lstatSync(sourcePath);
      members += 1;
      if (members > maximumMembers) {
        throw new Error("source tree exceeds its member limit");
      }
      if (metadata.isSymbolicLink()) {
        throw new Error("source tree must not contain symlinks");
      }
      if (metadata.isDirectory()) {
        mkdirSync(destinationPath, { mode: 0o700 });
        copyDirectory(sourcePath, destinationPath, false);
        continue;
      }
      if (!metadata.isFile()) {
        throw new Error("source tree contains a non-regular filesystem object");
      }
      if (metadata.size > maximumFileBytes) {
        throw new Error("source tree file exceeds its byte limit");
      }
      totalBytes += metadata.size;
      if (totalBytes > maximumTotalBytes) {
        throw new Error("source tree exceeds its aggregate byte limit");
      }
      copyFileSync(sourcePath, destinationPath);
      chmodSync(destinationPath, metadata.mode & 0o111 ? 0o755 : 0o644);
    }
  }

  copyDirectory(sourceRoot, destinationRoot, true);
  return { members, totalBytes };
}

export function runFixedCommand({
  modulePath,
  args,
  cwd,
  timeoutMs = COMMAND_TIMEOUT_MS,
  maximumOutputBytes = COMMAND_OUTPUT_BYTES,
  spawnSyncImpl = spawnSync,
}) {
  const completed = spawnSyncImpl(process.execPath, [modulePath, ...args], {
    cwd,
    env: {
      PATH: dirname(process.execPath),
      HOME: join(cwd, ".home"),
      XDG_CACHE_HOME: join(cwd, ".cache"),
      CI: "1",
      NO_COLOR: "1",
    },
    shell: false,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: maximumOutputBytes,
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  const stdoutExcerpt = boundedExcerpt(completed.stdout);
  const stderrExcerpt = boundedExcerpt(completed.stderr || completed.error?.message);

  if (completed.error !== undefined) {
    if (completed.error.code === "ETIMEDOUT") {
      return {
        exitCode: 124,
        stdoutExcerpt,
        stderrExcerpt,
        reasonCodes: ["command_timeout"],
      };
    }
    if (completed.error.code === "ENOBUFS") {
      return {
        exitCode: 125,
        stdoutExcerpt,
        stderrExcerpt,
        reasonCodes: ["command_output_limit"],
      };
    }
    return {
      exitCode: 126,
      stdoutExcerpt,
      stderrExcerpt,
      reasonCodes: ["command_launch_failed"],
    };
  }
  if (completed.status !== 0 || completed.signal !== null) {
    return {
      exitCode: Number.isInteger(completed.status) ? completed.status : 128,
      stdoutExcerpt,
      stderrExcerpt,
      reasonCodes: ["command_failed"],
    };
  }
  return { exitCode: 0, stdoutExcerpt, stderrExcerpt, reasonCodes: [] };
}

export function runValidationCommands(
  cwd,
  {
    spawnSyncImpl = spawnSync,
    typescriptModule = "/opt/noema/node_modules/typescript/bin/tsc",
    vitestModule = "/opt/noema/node_modules/vitest/vitest.mjs",
  } = {},
) {
  const typecheck = runFixedCommand({
    modulePath: typescriptModule,
    args: ["--noEmit", "--project", join(cwd, "tsconfig.json")],
    cwd,
    spawnSyncImpl,
  });
  if (typecheck.exitCode !== 0) {
    return typecheck;
  }
  return runFixedCommand({
    modulePath: vitestModule,
    args: ["run", "--coverage", "--config", join(cwd, "vitest.config.ts")],
    cwd,
    spawnSyncImpl,
  });
}

export function readEnvironment(env) {
  const values = {
    resultPath: env.NOEMA_RESULT_PATH,
    repositoryFullName: env.NOEMA_REPOSITORY,
    baseSha: env.NOEMA_BASE_SHA,
    headSha: env.NOEMA_HEAD_SHA,
    patchSha256: env.NOEMA_PATCH_SHA256,
    profile: env.NOEMA_PATCH_PROFILE,
    commandProfile: env.NOEMA_COMMAND_PROFILE,
    validatorImageDigest: env.NOEMA_VALIDATOR_IMAGE_DIGEST,
  };
  if (
    typeof values.resultPath !== "string" ||
    !values.resultPath.startsWith("/") ||
    !REPOSITORY.test(values.repositoryFullName ?? "") ||
    !SHA1.test(values.baseSha ?? "") ||
    !SHA1.test(values.headSha ?? "") ||
    !SHA256.test(values.patchSha256 ?? "") ||
    values.profile !== PROFILE ||
    values.commandProfile !== COMMAND_PROFILE ||
    !IMAGE_DIGEST.test(values.validatorImageDigest ?? "")
  ) {
    throw new Error("patch-validator environment is incomplete or malformed");
  }
  return values;
}

function readBoundedRegularFile(path, maximumBytes, label) {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    throw new Error(`${label} is unavailable`, { cause: error });
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  if (metadata.size <= 0 || metadata.size > maximumBytes) {
    throw new Error(`${label} has an invalid byte length`);
  }
  return readFileSync(path);
}

export function writeResultFile(
  resultPath,
  result,
  maximumBytes = MAX_RESULT_JSON_BYTES,
) {
  const bytes = Buffer.from(JSON.stringify(result), "utf8");
  if (bytes.length === 0 || bytes.length > maximumBytes) {
    throw new Error("patch-validator result exceeds its byte limit");
  }
  let linked;
  try {
    linked = lstatSync(resultPath);
  } catch (error) {
    throw new Error("patch-validator result file is unavailable", { cause: error });
  }
  if (linked.isSymbolicLink() || !linked.isFile()) {
    throw new Error("patch-validator result file must be a regular non-symlink file");
  }
  let descriptor;
  try {
    descriptor = openSync(resultPath, O_WRONLY | O_TRUNC | O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (opened.dev !== linked.dev || opened.ino !== linked.ino) {
      throw new Error("patch-validator result file changed during validation");
    }
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

function createResult(identity, commandResult, status, durationMs) {
  return {
    status,
    repository_full_name: identity.repositoryFullName,
    base_sha: identity.baseSha,
    head_sha: identity.headSha,
    patch_sha256: identity.patchSha256,
    profile: identity.profile,
    command_profile: identity.commandProfile,
    validator_image_digest: identity.validatorImageDigest,
    exit_code: commandResult.exitCode,
    duration_ms: Math.max(0, Math.min(MAX_RESULT_DURATION_MS, durationMs)),
    stdout_excerpt: boundedExcerpt(commandResult.stdoutExcerpt),
    stderr_excerpt: boundedExcerpt(commandResult.stderrExcerpt),
    reason_codes: commandResult.reasonCodes.slice(0, 20),
  };
}

export function runCli({
  env = process.env,
  inputRoot = "/input",
  patchPath = "/patch/input.patch",
  workspaceRoot = "/workspace",
  nodeModulesPath = "/opt/noema/node_modules",
  resultPath,
  now = Date.now,
  spawnSyncImpl = spawnSync,
} = {}) {
  const identity = readEnvironment(env);
  const effectiveResultPath = resultPath ?? identity.resultPath;
  const startedAt = now();
  let commandResult;
  let status;

  try {
    const patchBytes = readBoundedRegularFile(
      patchPath,
      MAX_PATCH_BYTES,
      "patch input",
    );
    const observedDigest =
      (await import("node:crypto")).createHash("sha256").update(patchBytes).digest("hex");
    if (observedDigest !== identity.patchSha256) {
      throw new Error("patch digest does not match the exact request");
    }
    const sourceRoot = join(workspaceRoot, "source");
    copySourceTree(inputRoot, sourceRoot);
    applyPatchSet(sourceRoot, parseUnifiedPatch(patchBytes));
    const workspaceNodeModules = join(sourceRoot, "node_modules");
    if (existsSync(workspaceNodeModules)) {
      throw new Error("private source unexpectedly contains node_modules");
    }
    const nodeModulesMetadata = lstatSync(nodeModulesPath);
    if (nodeModulesMetadata.isSymbolicLink() || !nodeModulesMetadata.isDirectory()) {
      throw new Error("image node_modules must be a regular directory");
    }
    symlinkSync(nodeModulesPath, workspaceNodeModules, "dir");
    commandResult = runValidationCommands(sourceRoot, { spawnSyncImpl });
    status = commandResult.exitCode === 0 ? "passed" : "failed";
  } catch (error) {
    commandResult = {
      exitCode: 1,
      stdoutExcerpt: "",
      stderrExcerpt: boundedExcerpt(error instanceof Error ? error.message : error),
      reasonCodes: ["patch_blocked"],
    };
    status = "blocked";
  }

  const result = createResult(identity, commandResult, status, now() - startedAt);
  writeResultFile(effectiveResultPath, result);
  return result;
}
