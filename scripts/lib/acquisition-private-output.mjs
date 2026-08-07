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

function sameOutputIdentity(left, right) {
  return Boolean(
    left
      && right
      && left.dev === right.dev
      && left.ino === right.ino,
  );
}

/**
 * Write one UTF-8 acquisition evidence file without following a pre-existing
 * symbolic link or silently switching filesystem objects during the write.
 * Existing regular files must have a single hard link and are opened without
 * truncation until their descriptor identity matches the path that was
 * inspected. Newly created files use O_EXCL. The descriptor is restricted to
 * owner-only mode before the final path identity is checked again.
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
    fileSystem.ftruncateSync(descriptor, 0);
    fileSystem.writeFileSync(descriptor, contents, { encoding: "utf8" });
    fileSystem.fchmodSync(descriptor, 0o600);

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
