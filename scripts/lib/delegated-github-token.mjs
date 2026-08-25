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
const CANONICAL_BEARER_TOKEN = /^[A-Za-z0-9\-._~+/]+={0,}$/;

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
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
  );
}

function assertSingleLinkCapability(metadata) {
  if (metadata.nlink !== 1n) {
    throw new Error("Maintainer token capability must have exactly one hard link.");
  }
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
  assertSingleLinkCapability(current);
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
 * owner-only, single-link regular file opened without following symlinks whose
 * descriptor and pathname remain bound to the same file version throughout the
 * read. The retained bearer bytes must already use the RFC 6750 token alphabet;
 * whitespace or Unicode normalization is never applied to credential authority.
 * Callers remain responsible for trusted bootstrap creation and prompt cleanup.
 */
export function readDelegatedGithubToken(tokenPath) {
  if (tokenPath === undefined || tokenPath === null || tokenPath === "") {
    throw new Error("Maintainer token file path is required.");
  }
  if (typeof tokenPath !== "string") {
    throw new Error("Maintainer token file path must be a string.");
  }
  const path = tokenPath;
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
    assertSingleLinkCapability(before);
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
    assertSingleLinkCapability(after);
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
    if (!CANONICAL_BEARER_TOKEN.test(token)) {
      throw new Error("Maintainer token must use canonical bearer-token bytes.");
    }
    return token;
  } finally {
    closeSync(descriptor);
  }
}
