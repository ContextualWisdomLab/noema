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

function regularSingleLink(metadata) {
  return Boolean(
    metadata
      && typeof metadata.isFile === "function"
      && typeof metadata.isSymbolicLink === "function"
      && metadata.isFile()
      && !metadata.isSymbolicLink()
      && metadata.nlink === 1,
  );
}

function sameIdentity(left, right) {
  return Boolean(
    left
      && right
      && left.dev === right.dev
      && left.ino === right.ino
      && left.mode === right.mode
      && left.size === right.size,
  );
}

function parentAuthority(path, fileSystem) {
  const parents = [];
  let current = dirname(resolve(path));
  const root = parse(current).root;
  while (current !== root) {
    const metadata = fileSystem.lstatSync(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("private output parent must remain a real directory");
    }
    parents.push({ path: current, dev: metadata.dev, ino: metadata.ino, mode: metadata.mode });
    current = dirname(current);
  }
  return parents;
}

function sameParentAuthority(left, right) {
  return left.length === right.length && left.every((parent, index) => {
    const current = right[index];
    return parent.path === current.path
      && parent.dev === current.dev
      && parent.ino === current.ino
      && parent.mode === current.mode;
  });
}

function truncatePublishedAfterCloseFailure(
  path,
  published,
  authorizedParents,
  fileSystem,
) {
  if (!sameParentAuthority(authorizedParents, parentAuthority(path, fileSystem))) {
    throw new Error("private output parent authority changed before close-failure cleanup");
  }
  const requiredFlags = ["O_WRONLY", "O_NOFOLLOW"];
  if (requiredFlags.some((name) => !Number.isInteger(fileSystem.constants?.[name]))) {
    throw new Error("private output close-failure cleanup requires no-follow write support");
  }
  const flags = requiredFlags.reduce((value, name) => value | fileSystem.constants[name], 0);
  const cleanupDescriptor = fileSystem.openSync(path, flags);
  let cleanupError;
  try {
    const opened = fileSystem.fstatSync(cleanupDescriptor);
    const retained = fileSystem.lstatSync(path);
    if (
      !regularSingleLink(opened)
      || !regularSingleLink(retained)
      || !sameIdentity(published, opened)
      || !sameIdentity(opened, retained)
    ) {
      throw new Error("private output identity changed before close-failure cleanup");
    }
    fileSystem.ftruncateSync(cleanupDescriptor, 0);
  } catch (error) {
    cleanupError = error;
  }
  try {
    fileSystem.closeSync(cleanupDescriptor);
  } catch (error) {
    if (cleanupError) {
      throw new AggregateError(
        [cleanupError, error],
        "private output close-failure cleanup and cleanup close both failed",
      );
    }
    throw error;
  }
  if (cleanupError) throw cleanupError;
}

/** Publish complete UTF-8 evidence exactly once without replacing its target. */
export function writePrivateNoReplaceFile(
  path,
  contents,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0 || typeof contents !== "string") {
    throw new TypeError("private output requires a non-empty path and UTF-8 text");
  }
  const authorizedParents = parentAuthority(path, fileSystem);
  const requiredFlags = ["O_WRONLY", "O_CREAT", "O_EXCL", "O_NOFOLLOW"];
  if (requiredFlags.some((name) => !Number.isInteger(fileSystem.constants?.[name]))) {
    throw new Error("private output requires exclusive no-follow open support");
  }
  let descriptor;
  try {
    const flags = requiredFlags.reduce((value, name) => value | fileSystem.constants[name], 0);
    descriptor = fileSystem.openSync(path, flags, 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("private output target must not already exist");
    throw error;
  }

  let published;
  let operationError;
  try {
    fileSystem.fchmodSync(descriptor, 0o600);
    if (!sameParentAuthority(authorizedParents, parentAuthority(path, fileSystem))) {
      throw new Error("private output parent authority changed during exclusive publication");
    }
    fileSystem.writeFileSync(descriptor, contents, { encoding: "utf8" });
    const opened = fileSystem.fstatSync(descriptor);
    if (!sameParentAuthority(authorizedParents, parentAuthority(path, fileSystem))) {
      throw new Error("private output parent authority changed during exclusive publication");
    }
    published = fileSystem.lstatSync(path);
    if (
      !regularSingleLink(opened)
      || opened.size !== Buffer.byteLength(contents, "utf8")
      || !regularSingleLink(published)
      || !sameIdentity(opened, published)
    ) {
      throw new Error("private output changed during exclusive publication");
    }
  } catch (error) {
    operationError = error;
    try {
      fileSystem.ftruncateSync(descriptor, 0);
    } catch (cleanupError) {
      try {
        fileSystem.closeSync(descriptor);
      } catch (closeError) {
        throw new AggregateError(
          [error, cleanupError, closeError],
          "private output failed, could not be truncated, and close failed; operator removal is required",
        );
      }
      throw new AggregateError(
        [error, cleanupError],
        "private output failed and could not be truncated; operator removal is required",
      );
    }
  }

  let closeError;
  try {
    fileSystem.closeSync(descriptor);
  } catch (error) {
    closeError = error;
  }

  if (operationError) {
    if (closeError) {
      throw new AggregateError(
        [operationError, closeError],
        "private output failed and descriptor close also failed; output was truncated but operator inspection is required",
      );
    }
    throw operationError;
  }

  if (closeError) {
    try {
      truncatePublishedAfterCloseFailure(path, published, authorizedParents, fileSystem);
    } catch (cleanupError) {
      throw new AggregateError(
        [closeError, cleanupError],
        "private output close failed and the published output could not be safely truncated; operator removal is required",
      );
    }
    throw new AggregateError(
      [closeError],
      "private output close failed; output was truncated and is non-authoritative",
    );
  }

  return published;
}