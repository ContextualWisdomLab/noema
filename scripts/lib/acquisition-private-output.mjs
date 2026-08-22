import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, resolve } from "node:path";

const defaultFileSystem = Object.freeze({
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
});

function safeOutputMetadata(metadata) {
  return Boolean(
    metadata
      && typeof metadata.isFile === "function"
      && typeof metadata.isSymbolicLink === "function"
      && metadata.isFile()
      && !metadata.isSymbolicLink()
      && metadata.nlink === 1,
  );
}

function safeParentMetadata(metadata) {
  return Boolean(
    metadata
      && typeof metadata.isDirectory === "function"
      && typeof metadata.isSymbolicLink === "function"
      && metadata.isDirectory()
      && !metadata.isSymbolicLink(),
  );
}

function sameOutputIdentity(left, right) {
  return Boolean(
    left
      && right
      && left.dev === right.dev
      && left.ino === right.ino,
  );
}

/**
 * Refuse an acquisition output path when any existing parent component is a
 * symbolic link or a non-directory filesystem object.
 *
 * The walk starts at the output leaf's parent and continues to the filesystem
 * root, so a missing intermediate directory does not hide an unsafe higher
 * ancestor. This boundary is intentionally checked before directory creation
 * and again by the private writer immediately before opening the leaf.
 */
export function assertAcquisitionPrivatePathParents(
  path,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0) {
    throw new TypeError("acquisition output requires a non-empty path");
  }
  const absolutePath = resolve(path);
  const rootPath = parse(absolutePath).root;
  let currentPath = dirname(absolutePath);
  while (true) {
    const metadata = fileSystem.lstatSync(currentPath, { throwIfNoEntry: false }) ?? null;
    if (metadata && !safeParentMetadata(metadata)) {
      throw new Error("acquisition output parent must be a real directory without symbolic links");
    }
    if (currentPath === rootPath) {
      return;
    }
    currentPath = dirname(currentPath);
  }
}

function writeNewPrivateFile(path, contents, fileSystem, flags) {
  const descriptor = fileSystem.openSync(path, flags, 0o600);
  try {
    const opened = fileSystem.fstatSync(descriptor);
    if (!safeOutputMetadata(opened)) {
      throw new Error("acquisition output path changed before writing");
    }
    fileSystem.fchmodSync(descriptor, 0o600);
    fileSystem.ftruncateSync(descriptor, 0);
    fileSystem.writeFileSync(descriptor, contents, { encoding: "utf8" });

    const afterDescriptor = fileSystem.fstatSync(descriptor);
    const afterPath = fileSystem.lstatSync(path);
    if (
      !safeOutputMetadata(afterDescriptor)
      || !safeOutputMetadata(afterPath)
      || !sameOutputIdentity(afterDescriptor, afterPath)
    ) {
      throw new Error("acquisition output path changed while writing");
    }
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

/**
 * Write one UTF-8 acquisition evidence file without following a pre-existing
 * symbolic link or silently switching filesystem objects during the write.
 * Existing regular files must have a single hard link and are identity-checked
 * through a no-follow descriptor before replacement. Replacement bytes are
 * written completely to an owner-only, exclusive sibling file and atomically
 * renamed over the verified target only after the write succeeds, so a failed
 * replacement cannot truncate or partially overwrite trusted prior evidence.
 * Newly created targets use O_EXCL directly. Existing parent components are
 * required to be real directories, never symbolic links or non-directory
 * objects, both before staging and immediately before replacement.
 */
export function writeAcquisitionPrivateFile(
  path,
  contents,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0 || typeof contents !== "string") {
    throw new TypeError("acquisition output requires a non-empty path and UTF-8 text");
  }
  const writeOnly = fileSystem.constants?.O_WRONLY;
  const create = fileSystem.constants?.O_CREAT;
  const exclusive = fileSystem.constants?.O_EXCL;
  const noFollow = fileSystem.constants?.O_NOFOLLOW;
  if (![writeOnly, create, exclusive, noFollow].every(Number.isInteger)) {
    throw new Error("acquisition output requires no-follow filesystem support");
  }

  assertAcquisitionPrivatePathParents(path, fileSystem);
  const before = fileSystem.lstatSync(path, { throwIfNoEntry: false }) ?? null;
  if (before && !safeOutputMetadata(before)) {
    throw new Error("acquisition output path must be a single-link regular file");
  }

  if (!before) {
    writeNewPrivateFile(
      path,
      contents,
      fileSystem,
      writeOnly | create | exclusive | noFollow,
    );
    return;
  }

  if (typeof fileSystem.renameSync !== "function" || typeof fileSystem.unlinkSync !== "function") {
    throw new Error("acquisition output replacement requires atomic rename filesystem support");
  }

  const existingDescriptor = fileSystem.openSync(path, writeOnly | noFollow, 0o600);
  try {
    const opened = fileSystem.fstatSync(existingDescriptor);
    if (!safeOutputMetadata(opened) || !sameOutputIdentity(before, opened)) {
      throw new Error("acquisition output path changed before writing");
    }
    fileSystem.fchmodSync(existingDescriptor, 0o600);
  } finally {
    fileSystem.closeSync(existingDescriptor);
  }

  const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let staged = false;
  let stagedMetadata = null;
  try {
    const stagedDescriptor = fileSystem.openSync(
      tempPath,
      writeOnly | create | exclusive | noFollow,
      0o600,
    );
    staged = true;
    try {
      fileSystem.fchmodSync(stagedDescriptor, 0o600);
      fileSystem.ftruncateSync(stagedDescriptor, 0);
      fileSystem.writeFileSync(stagedDescriptor, contents, { encoding: "utf8" });
      stagedMetadata = fileSystem.fstatSync(stagedDescriptor);
      if (!safeOutputMetadata(stagedMetadata)) {
        throw new Error("acquisition staged output must remain a single-link regular file");
      }
    } finally {
      fileSystem.closeSync(stagedDescriptor);
    }

    assertAcquisitionPrivatePathParents(path, fileSystem);
    const currentTarget = fileSystem.lstatSync(path, { throwIfNoEntry: false }) ?? null;
    if (
      !safeOutputMetadata(currentTarget)
      || !sameOutputIdentity(before, currentTarget)
    ) {
      throw new Error("acquisition output path changed before atomic replacement");
    }

    fileSystem.renameSync(tempPath, path);
    staged = false;

    const afterPath = fileSystem.lstatSync(path);
    if (
      !safeOutputMetadata(afterPath)
      || !sameOutputIdentity(stagedMetadata, afterPath)
    ) {
      throw new Error("acquisition output path changed during atomic replacement");
    }
  } finally {
    if (staged) {
      try {
        fileSystem.unlinkSync(tempPath);
      } catch {
        // Preserve the original write/validation error; a uniquely named staged
        // file contains only the attempted new evidence and never became authority.
      }
    }
  }
}
