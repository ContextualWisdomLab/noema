import { createHash, randomUUID } from "node:crypto";
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
import { dirname, join, normalize, parse, resolve } from "node:path";

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

const activeAcquisitionWriters = new Set();

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

function sameOutputVersion(left, right) {
  return Boolean(
    sameOutputIdentity(left, right)
      && left.mode === right.mode
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs
      && left.ctimeMs === right.ctimeMs,
  );
}

function sameAtomicReplacementVersion(left, right) {
  return Boolean(
    sameOutputIdentity(left, right)
      && left.mode === right.mode
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs,
  );
}

function cleanupIdentityMatchedPath(path, expectedMetadata, fileSystem) {
  if (!safeOutputMetadata(expectedMetadata) || typeof fileSystem.unlinkSync !== "function") {
    return;
  }
  try {
    assertAcquisitionPrivatePathParents(path, fileSystem);
    const cleanupCandidate = fileSystem.lstatSync(path, { throwIfNoEntry: false }) ?? null;
    if (
      safeOutputMetadata(cleanupCandidate)
      && sameOutputIdentity(expectedMetadata, cleanupCandidate)
    ) {
      fileSystem.unlinkSync(path);
    }
  } catch {
    // Lock and staging cleanup is best-effort only. Final evidence paths use
    // descriptor-bound neutralization below so cleanup can never unlink a
    // concurrent replacement after a pathname identity check.
  }
}

function neutralizeIdentityMatchedPath(path, expectedMetadata, fileSystem) {
  if (
    !safeOutputMetadata(expectedMetadata)
    || typeof fileSystem.openSync !== "function"
    || typeof fileSystem.fstatSync !== "function"
    || typeof fileSystem.ftruncateSync !== "function"
    || typeof fileSystem.closeSync !== "function"
  ) {
    return;
  }

  const writeOnly = fileSystem.constants?.O_WRONLY;
  const noFollow = fileSystem.constants?.O_NOFOLLOW;
  if (!Number.isInteger(writeOnly) || !Number.isInteger(noFollow)) {
    return;
  }

  let descriptor = null;
  try {
    assertAcquisitionPrivatePathParents(path, fileSystem);
    descriptor = fileSystem.openSync(path, writeOnly | noFollow);
    const opened = fileSystem.fstatSync(descriptor);
    const retained = fileSystem.lstatSync(path, { throwIfNoEntry: false }) ?? null;
    assertAcquisitionPrivatePathParents(path, fileSystem);
    if (
      safeOutputMetadata(opened)
      && safeOutputMetadata(retained)
      && sameOutputIdentity(expectedMetadata, opened)
      && sameOutputIdentity(opened, retained)
    ) {
      fileSystem.ftruncateSync(descriptor, 0);
    }
  } catch {
    // Preserve the original write/validation failure. The cleanup descriptor is
    // bound before the final pathname check; if the pathname is concurrently
    // replaced, only the writer-owned inode can be truncated and the replacement
    // remains untouched. An uncertain failed output therefore requires operator
    // inspection instead of destructive pathname cleanup.
  } finally {
    if (descriptor !== null) {
      try {
        fileSystem.closeSync(descriptor);
      } catch {
        // Cleanup close failure does not replace the original operation error.
      }
    }
  }
}

function acquisitionWriterLockPath(path) {
  const absolutePath = resolve(path);
  const digest = createHash("sha256").update(absolutePath).digest("hex");
  return join(dirname(absolutePath), `.noema-acquisition-writer-${digest}.lock`);
}

function acquireAcquisitionWriterLock(path, fileSystem, flags) {
  const targetIdentity = resolve(path);
  if (activeAcquisitionWriters.has(targetIdentity)) {
    throw new Error("acquisition output writer already active for target");
  }
  activeAcquisitionWriters.add(targetIdentity);

  if (fileSystem !== defaultFileSystem) {
    return { targetIdentity, lockPath: null, lockMetadata: null };
  }

  const lockPath = acquisitionWriterLockPath(path);
  let descriptor = null;
  let lockMetadata = null;
  try {
    descriptor = fileSystem.openSync(lockPath, flags, 0o600);
    lockMetadata = fileSystem.fstatSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = null;
    return { targetIdentity, lockPath, lockMetadata };
  } catch (error) {
    if (descriptor !== null) {
      if (!lockMetadata) {
        try {
          const descriptorMetadata = fileSystem.fstatSync(descriptor);
          const pathMetadata = fileSystem.lstatSync(lockPath, { throwIfNoEntry: false }) ?? null;
          if (sameOutputIdentity(descriptorMetadata, pathMetadata)) {
            lockMetadata = descriptorMetadata;
          }
        } catch {
          // Without exact descriptor/path identity, leave the lock pathname in
          // place so an uncertain acquisition fails closed across processes.
        }
      }
      try {
        fileSystem.closeSync(descriptor);
      } catch {
        // Preserve the original acquisition error; the lock pathname cleanup
        // below remains identity-bounded when metadata authority was obtained.
      }
    }
    if (lockMetadata) {
      cleanupIdentityMatchedPath(lockPath, lockMetadata, fileSystem);
    }
    activeAcquisitionWriters.delete(targetIdentity);
    throw error;
  }
}

function releaseAcquisitionWriterLock(lock, fileSystem) {
  activeAcquisitionWriters.delete(lock.targetIdentity);
  if (lock.lockPath !== null) {
    cleanupIdentityMatchedPath(lock.lockPath, lock.lockMetadata, fileSystem);
  }
}

/**
 * Refuse an acquisition output path when its lexical form can resolve through
 * different filesystem ancestors, or when any existing parent component is a
 * symbolic link or a non-directory filesystem object.
 *
 * The lexical canonicality check prevents `.` / `..`, repeated separators, or
 * similar aliases from making the path checked with `resolve()` differ from the
 * path later opened by the kernel. The parent walk then starts at the output
 * leaf's parent and continues to the filesystem root, so a missing intermediate
 * directory does not hide an unsafe higher ancestor. This boundary is checked
 * before directory creation and again around the private writer's no-follow
 * leaf opens.
 */
export function assertAcquisitionPrivatePathParents(
  path,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0) {
    throw new TypeError("acquisition output requires a non-empty path");
  }
  if (normalize(path) !== path) {
    throw new Error("acquisition output path must be lexically canonical");
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
  let operationFailed = false;
  let closeFailed = false;
  let closeError;
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
      || !sameOutputVersion(afterDescriptor, afterPath)
    ) {
      throw new Error("acquisition output path changed while writing");
    }
    accepted = true;
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      fileSystem.closeSync(descriptor);
    } catch (error) {
      closeFailed = true;
      closeError = error;
    }
    if (!accepted || closeFailed) {
      neutralizeIdentityMatchedPath(path, createdMetadata, fileSystem);
    }
  }
  if (closeFailed && !operationFailed) {
    throw closeError;
  }
}

/**
 * Write one UTF-8 acquisition evidence file without following a pre-existing
 * symbolic link or silently switching filesystem objects during the write.
 * Existing regular files must have a single hard link and are version-checked
 * through a read-only no-follow descriptor without mutating their bytes or
 * metadata before replacement commits. Replacement bytes are written completely
 * to an owner-only, exclusive sibling file and atomically renamed over the
 * unchanged verified target only after the write succeeds. A same-target writer
 * lease is held from the first target inspection through replacement acceptance,
 * preventing two cooperating writers from validating the same predecessor and
 * then clobbering each other. Production/default-filesystem writers additionally
 * take an exclusive no-follow sibling lock file so separate Node processes share
 * the same serialization boundary. A crashed writer may leave that lock behind;
 * this fails closed and requires operator inspection rather than guessing that a
 * potentially active writer is stale. The renamed staged inode is then checked
 * against its pre-rename identity, mode, size, and mtime before acceptance. POSIX
 * rename may itself advance ctime, so ctime remains an exact guard before rename
 * but is not compared across the rename operation. If the writer-owned inode
 * changes at the final handoff, the operation fails closed and neutralizes only
 * the writer-owned inode through a no-follow descriptor; it never unlinks a
 * concurrent replacement after a pathname check. A failed or stale replacement
 * therefore cannot truncate, chmod, partially overwrite, or silently clobber a
 * concurrent update to trusted prior evidence. A safe existing target may itself
 * be read-only because replacement authority comes from the containing directory;
 * verification never requires write access to the old inode. Newly created
 * targets use O_EXCL directly; failed publication leaves an identity-bound
 * non-authoritative leaf (truncated when the writer inode can still be proven)
 * for operator inspection rather than deleting by pathname. Existing parent
 * components are required to be real directories, never symbolic links or
 * non-directory objects, and the configured output path must already be
 * lexically canonical before and immediately after each leaf/staging open and
 * again before a new file is accepted or an existing target is atomically
 * replaced.
 */
export function writeAcquisitionPrivateFile(
  path,
  contents,
  fileSystem = defaultFileSystem,
  options = {},
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
  const writerLock = acquireAcquisitionWriterLock(
    path,
    fileSystem,
    writeOnly | create | exclusive | noFollow,
  );
  try {
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

    if (options.replaceExisting === false) {
      throw new Error("acquisition output target must not already exist");
    }

    if (typeof fileSystem.renameSync !== "function" || typeof fileSystem.unlinkSync !== "function") {
      throw new Error("acquisition output replacement requires atomic rename filesystem support");
    }

    const existingDescriptor = fileSystem.openSync(path, readOnly | noFollow);
    try {
      assertAcquisitionPrivatePathParents(path, fileSystem);
      const opened = fileSystem.fstatSync(existingDescriptor);
      if (!safeOutputMetadata(opened) || !sameOutputVersion(before, opened)) {
        throw new Error("acquisition output path changed before writing");
      }
    } finally {
      fileSystem.closeSync(existingDescriptor);
    }

    const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
    let staged = false;
    let stagedMetadata = null;
    let stagedWrittenMetadata = null;
    let replacementCommitted = false;
    let replacementAccepted = false;
    try {
      const stagedDescriptor = fileSystem.openSync(
        tempPath,
        writeOnly | create | exclusive | noFollow,
        0o600,
      );
      staged = true;
      try {
        stagedMetadata = fileSystem.fstatSync(stagedDescriptor);
        assertAcquisitionPrivatePathParents(tempPath, fileSystem);
        if (!safeOutputMetadata(stagedMetadata)) {
          throw new Error("acquisition staged output must remain a single-link regular file");
        }
        fileSystem.fchmodSync(stagedDescriptor, 0o600);
        fileSystem.ftruncateSync(stagedDescriptor, 0);
        fileSystem.writeFileSync(stagedDescriptor, contents, { encoding: "utf8" });
        stagedWrittenMetadata = fileSystem.fstatSync(stagedDescriptor);
        if (
          !safeOutputMetadata(stagedWrittenMetadata)
          || !sameOutputIdentity(stagedMetadata, stagedWrittenMetadata)
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
        || !sameOutputVersion(before, currentTarget)
      ) {
        throw new Error("acquisition output path changed before atomic replacement");
      }

      const currentStaged = fileSystem.lstatSync(tempPath, { throwIfNoEntry: false }) ?? null;
      if (
        !safeOutputMetadata(currentStaged)
        || !sameOutputVersion(stagedWrittenMetadata, currentStaged)
      ) {
        throw new Error("acquisition staged output path changed before atomic replacement");
      }

      fileSystem.renameSync(tempPath, path);
      staged = false;
      replacementCommitted = true;

      const afterPath = fileSystem.lstatSync(path);
      if (
        !safeOutputMetadata(afterPath)
        || !sameAtomicReplacementVersion(stagedWrittenMetadata, afterPath)
      ) {
        throw new Error("acquisition output path changed during atomic replacement");
      }
      replacementAccepted = true;
    } finally {
      if (staged && stagedMetadata) {
        cleanupIdentityMatchedPath(tempPath, stagedMetadata, fileSystem);
      } else if (replacementCommitted && !replacementAccepted && stagedMetadata) {
        neutralizeIdentityMatchedPath(path, stagedMetadata, fileSystem);
      }
    }
  } finally {
    releaseAcquisitionWriterLock(writerLock, fileSystem);
  }
}
