import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { dirname, parse, resolve } from "node:path";

const MAX_DELEGATED_TOKEN_BYTES = 16 * 1024;

function boundedFileError(error) {
  return String(error?.message ?? error)
    .replace(/\bbearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 1_024);
}

function sameFileVersion(left, right) {
  return (
    left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
  );
}

function assertCapabilityPathVersion(path, expected) {
  let current;
  try {
    current = lstatSync(path, { bigint: true });
  } catch {
    throw new Error("Maintainer token file changed during the bounded read.");
  }
  if (!current.isFile() || !sameFileVersion(expected, current)) {
    throw new Error("Maintainer token file changed during the bounded read.");
  }
}

function assertNoSymlinkedParentDirectories(path) {
  const absolutePath = resolve(path);
  let current = dirname(absolutePath);
  const root = parse(current).root;

  while (current !== root) {
    let parent;
    try {
      parent = lstatSync(current);
    } catch {
      throw new Error("Maintainer token capability parent directories could not be verified.");
    }
    if (!parent.isDirectory()) {
      throw new Error("Maintainer token capability path must not traverse symlinked parent directories.");
    }
    current = dirname(current);
  }
}

/**
 * Load a short-lived delegated GitHub token from an explicit capability file.
 *
 * The file path is non-secret runtime configuration. The bearer token itself
 * must not be read from the Node process environment. The reader fails closed
 * unless every parent is a real directory and the capability is a bounded,
 * owner-only, regular file opened without following symlinks whose descriptor
 * and pathname remain bound to the same file version throughout the read.
 * Callers remain responsible for trusted bootstrap creation and prompt cleanup.
 */
export function readDelegatedGithubToken(tokenPath) {
  const path = String(tokenPath ?? "");
  if (!path) {
    throw new Error("Maintainer token file path is required.");
  }
  if (path !== path.trim()) {
    throw new Error("Maintainer token file path must be canonical.");
  }
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("Maintainer token capability requires no-follow file support.");
  }

  assertNoSymlinkedParentDirectories(path);

  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(`Maintainer token file could not be opened safely: ${boundedFileError(error)}`);
  }

  try {
    assertNoSymlinkedParentDirectories(path);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) {
      throw new Error("Maintainer token capability must be a regular file.");
    }
    if ((before.mode & 0o077n) !== 0n) {
      throw new Error("Maintainer token file permissions must be owner-only.");
    }
    if (typeof process.getuid === "function" && before.uid !== BigInt(process.getuid())) {
      throw new Error("Maintainer token file must be owned by the current process user.");
    }
    if (before.size === 0n) {
      throw new Error("Maintainer token file must not be empty.");
    }
    if (before.size > BigInt(MAX_DELEGATED_TOKEN_BYTES)) {
      throw new Error("Maintainer token file exceeds the bounded size limit.");
    }
    assertCapabilityPathVersion(path, before);

    const buffer = Buffer.alloc(MAX_DELEGATED_TOKEN_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead,
      );
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > MAX_DELEGATED_TOKEN_BYTES) {
      throw new Error("Maintainer token file exceeds the bounded size limit.");
    }

    const after = fstatSync(descriptor, { bigint: true });
    assertNoSymlinkedParentDirectories(path);
    if (!sameFileVersion(before, after) || BigInt(bytesRead) !== before.size) {
      throw new Error("Maintainer token file changed during the bounded read.");
    }
    assertCapabilityPathVersion(path, after);

    let token;
    try {
      token = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
    } catch {
      throw new Error("Maintainer token file contains invalid UTF-8.");
    }
    if (!token) {
      throw new Error("Maintainer token file must not be empty.");
    }
    if (/[\u0000-\u001f\u007f]/.test(token)) {
      throw new Error("Maintainer token must not contain control characters.");
    }
    return token;
  } finally {
    closeSync(descriptor);
  }
}
