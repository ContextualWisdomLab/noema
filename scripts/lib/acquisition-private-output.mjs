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

function cleanupIdentityMatchedPath(path, expectedMetadata, fileSystem) {
  if (!expectedMetadata || typeof fileSystem.unlinkSync !== "function") {
    return;
  }
  try {
    const cleanupCandidate = fileSystem.lstatSync(path, { throwIfNoEntry: false }) ?? null;
    if (sameOutputIdentity(expectedMetadata, cleanupCandidate)) {
      fileSystem.unlinkSync(path);
    }
  } catch {
    // Preserve the original write/validation error. Cleanup authority is
    // limited to the same inode; a replaced pathname is never unlinked.
  }
}

/**
 * Refuse an acquisition output path when any existing parent component is a
 * symbolic link or a non-directory filesystem object.
 *
 * The walk starts at the output leaf's parent and continues to the filesystem
 * root, so a missing intermediate directory does not hide an unsafe higher
 * ancestor. This boundary is intentionally checked before directory creation
 * and again around the private writer's no-follow leaf opens.
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
  let createdMetadata = null;
  let accepted = false;
  try {
    createdMetadata = fileSystem.fstatSync(descriptor);
    if (!safeOutputMetadata(createdMetadata)) {
      throw new Error("acquisition output path changed before writing");
    }
    assertAcquisitionPrivatePathParents(path, fileSystem);
    fileSystem.fchmodSync(descriptor, 0o600);
    fileSystem.ftruncateSync(descriptor, 0);
    fileSystem.writeFileSync(descriptor, contents, { encoding: "utf8" });

    const afterDescriptor = fileSystem.fstatSync(descriptor);
    assertAcquisitionPrivatePathParents(path, fileSystem);
    const afterPath = fileSystem.lstatSync(path);
    if (
      !safeOutputMetadata(afterDescriptor)
      || !safeOutputMetadata(afterPath)
      || !sameOutputIdentity(afterDescriptor, afterPath)
    ) {
      throw new Error("acquisition output path changed while writing");
    }
    accepted = true;
  } finally {
    fileSystem.closeSync(descriptor);
    if (!accepted) {
      cleanupIdentityMatchedPath(path, createdMetadata, fileSystem);
    }
  }
}

/**
 * Write one UTF-8 acquisition evidence file without following a pre-existing
 * symbolic link or silently switching filesystem objects during the write.
 * Existing regular files must have a single hard link and are identity-checked
 * through a read-only no-follow descriptor without mutating their bytes or
 * metadata before replacement commits. Replacement bytes are written completely
 * to an owner-only, exclusive sibling file and atomically renamed over the
 * verified target only after the write succeeds, so a failed replacement cannot
 * truncate, chmod, or partially overwrite trusted prior evidence. A safe existing
 * target may itself be read-only because replacement authority comes from the
 * containing directory; verification never requires write access to the old inode.
 * Newly created targets use O_EXCL directly and remove their identity-matched leaf
 * when a synchronous validation/write failure occurs. Existing parent components
 * are required to be real directories, never symbolic links or non-directory
 * objects, before and immediately after each leaf/staging open and again before a
 * new file is accepted or an existing target is atomically replaced.
 */
export function writeAcquisitionPrivateFile(
  path,
  contents,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0 || typeof contents !== "string") {
    throw new TypeError("acquisition output requires a non-empty path and UTF-8 text");
  }
  const readOnly = fileSystem.constants?.O_RDONLY;
  const writeOnly = fileSystem.constants?.O_WRONLY;
  const create = fileSystem.constants?.O_CREAT;
  const exclusive = fileSystem.constants?.O_EXCL;
  const noFollow = fileSystem.constants?.O_NOFOLLOW;
  if (![readOnly, writeOnly, create, exclusive, noFollow].every(Number.isInteger)) {
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

  const existingDescriptor = fileSystem.openSync(path, readOnly | noFollow);
  try {
    assertAcquisitionPrivatePathParents(path, fileSystem);
    const opened = fileSystem.fstatSync(existingDescriptor);
    if (!safeOutputMetadata(opened) || !sameOutputIdentity(before, opened)) {
      throw new Error("acquisition output path changed before writing");
    }
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
      assertAcquisitionPrivatePathParents(tempPath, fileSystem);
      stagedMetadata = fileSystem.fstatSync(stagedDescriptor);
      if (!safeOutputMetadata(stagedMetadata)) {
        throw new Error("acquisition staged output must remain a single-link regular file");
      }
      fileSystem.fchmodSync(stagedDescriptor, 0o600);
      fileSystem.ftruncateSync(stagedDescriptor, 0);
      fileSystem.writeFileSync(stagedDescriptor, contents, { encoding: "utf8" });
      const afterStagedWrite = fileSystem.fstatSync(stagedDescriptor);
      if (
        !safeOutputMetadata(afterStagedWrite)
        || !sameOutputIdentity(stagedMetadata, afterStagedWrite)
      ) {
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

    const currentStaged = fileSystem.lstatSync(tempPath, { throwIfNoEntry: false }) ?? null;
    if (
      !safeOutputMetadata(currentStaged)
      || !sameOutputIdentity(stagedMetadata, currentStaged)
    ) {
      throw new Error("acquisition staged output path changed before atomic replacement");
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
    if (staged && stagedMetadata) {
      cleanupIdentityMatchedPath(tempPath, stagedMetadata, fileSystem);
    }
  }
}
