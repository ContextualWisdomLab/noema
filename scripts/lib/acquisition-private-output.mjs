import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
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

/**
 * Write one UTF-8 acquisition evidence file without following a pre-existing
 * symbolic link or silently switching filesystem objects during the write.
 * Existing regular files must have a single hard link and are opened without
 * truncation until their descriptor identity matches the path that was
 * inspected. Newly created files use O_EXCL. The descriptor is restricted to
 * owner-only mode before any content is truncated or written, and the final
 * path identity is checked again afterward. Existing parent components are
 * also required to be real directories, never symbolic links or non-directory
 * objects.
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

  const flags = before
    ? writeOnly | noFollow
    : writeOnly | create | exclusive | noFollow;
  const descriptor = fileSystem.openSync(path, flags, 0o600);
  try {
    const opened = fileSystem.fstatSync(descriptor);
    if (!safeOutputMetadata(opened) || (before && !sameOutputIdentity(before, opened))) {
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
