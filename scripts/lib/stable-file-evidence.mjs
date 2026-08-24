import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { dirname, parse, resolve } from "node:path";

const MAXIMUM_SIGNED_OPEN_FLAG = 0x7fff_ffff;
const defaultFileSystem = Object.freeze({
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
});

function fail(label, detail) {
  throw new Error(`${label} ${detail}`);
}

function safeOpenFlag(value, { allowZero }) {
  return Number.isSafeInteger(value)
    && value >= 0
    && value <= MAXIMUM_SIGNED_OPEN_FLAG
    && (allowZero || value !== 0);
}

function requireRegularMetadata(metadata, label, maximumBytes) {
  if (!metadata || typeof metadata !== "object" || typeof metadata.isFile !== "function") {
    fail(label, "metadata is unavailable");
  }
  if (typeof metadata.isSymbolicLink === "function" && metadata.isSymbolicLink()) {
    fail(label, "must not be a symbolic link");
  }
  if (!metadata.isFile()) {
    fail(label, "must be a regular file");
  }
  if (!Number.isSafeInteger(metadata.nlink) || metadata.nlink !== 1) {
    fail(label, "must be a single-link regular file");
  }
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) {
    fail(label, "has an invalid byte size");
  }
  if (metadata.size === 0) {
    fail(label, "must not be empty");
  }
  if (metadata.size > maximumBytes) {
    fail(label, `exceeds the ${maximumBytes}-byte ceiling`);
  }
  return metadata;
}

function requireParentDirectoryMetadata(metadata, label) {
  if (!metadata || typeof metadata !== "object" || typeof metadata.isDirectory !== "function") {
    fail(label, "parent directory metadata is unavailable");
  }
  if (typeof metadata.isSymbolicLink === "function" && metadata.isSymbolicLink()) {
    fail(label, "must not traverse symbolic-link parent directories");
  }
  if (!metadata.isDirectory()) {
    fail(label, "parent path must be a real directory");
  }
}

function assertNoSymlinkedParentDirectories(path, label, fileSystem) {
  const absolutePath = resolve(path);
  let current = dirname(absolutePath);
  const root = parse(current).root;
  while (current !== root) {
    requireParentDirectoryMetadata(fileSystem.lstatSync(current), label);
    current = dirname(current);
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size;
}

function sameStableDescriptor(left, right) {
  return sameIdentity(left, right)
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

/**
 * Read one bounded regular file through a no-follow descriptor and accept the
 * bytes only while both descriptor state and the pathname-to-inode mapping stay
 * stable for the complete read. Every ancestor directory is also required to be
 * a real non-symlink directory before open, after open, and after the bounded
 * descriptor read so a final-component O_NOFOLLOW check cannot be bypassed by a
 * symlinked parent path. The accepted evidence inode must also have exactly one
 * hard link so another pathname cannot mutate the same inode outside this
 * canonical evidence path during or after validation. Pathname/descriptor
 * comparisons include modification/change time so same-inode rewrites cannot
 * cross either edge of the bounded read unnoticed merely by preserving size.
 *
 * @param {string} path filesystem path to read
 * @param {string} label bounded diagnostic label that never contains file bytes
 * @param {number} maximumBytes positive safe byte ceiling
 * @param {object} fileSystem injectable Node-compatible filesystem adapter for deterministic race tests
 * @returns {Buffer} exact accepted bytes
 */
export function readStableRegularFile(
  path,
  label,
  maximumBytes,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0) {
    fail("stable file", "path must be a non-empty string");
  }
  if (typeof label !== "string" || label.length === 0) {
    fail("stable file", "label must be a non-empty string");
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    fail(label, "requires a positive safe byte ceiling");
  }

  const noFollow = fileSystem.constants?.O_NOFOLLOW;
  const readOnly = fileSystem.constants?.O_RDONLY;
  if (!safeOpenFlag(noFollow, { allowZero: false })) {
    fail(label, "requires a supported no-follow open flag");
  }
  if (!safeOpenFlag(readOnly, { allowZero: true })) {
    fail(label, "requires a supported read-only open flag");
  }

  assertNoSymlinkedParentDirectories(path, label, fileSystem);
  const pathMetadata = requireRegularMetadata(
    fileSystem.lstatSync(path),
    label,
    maximumBytes,
  );
  const descriptor = fileSystem.openSync(path, readOnly | noFollow);
  try {
    assertNoSymlinkedParentDirectories(path, label, fileSystem);
    const openedMetadata = requireRegularMetadata(
      fileSystem.fstatSync(descriptor),
      label,
      maximumBytes,
    );
    if (!sameStableDescriptor(pathMetadata, openedMetadata)) {
      fail(label, "changed before read");
    }

    const chunks = [];
    let totalBytes = 0;
    while (totalBytes <= maximumBytes) {
      const remaining = maximumBytes + 1 - totalBytes;
      const target = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const bytesRead = fileSystem.readSync(descriptor, target, 0, target.length, null);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(target.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    if (totalBytes > maximumBytes) {
      fail(label, `exceeded the ${maximumBytes}-byte ceiling while reading`);
    }

    const finalMetadata = requireRegularMetadata(
      fileSystem.fstatSync(descriptor),
      label,
      maximumBytes,
    );
    if (!sameStableDescriptor(openedMetadata, finalMetadata)) {
      fail(label, "changed while being read");
    }
    if (totalBytes !== openedMetadata.size) {
      fail(label, "byte count differs from the opened descriptor size");
    }

    assertNoSymlinkedParentDirectories(path, label, fileSystem);
    const finalPathMetadata = requireRegularMetadata(
      fileSystem.lstatSync(path),
      label,
      maximumBytes,
    );
    if (!sameStableDescriptor(openedMetadata, finalPathMetadata)) {
      fail(label, "pathname changed while being read");
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}
