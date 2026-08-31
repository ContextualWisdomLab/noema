import { closeSync, constants, fstatSync, lstatSync, openSync, writeFileSync } from "node:fs";

const defaultFileSystem = Object.freeze({ closeSync, constants, fstatSync, lstatSync, openSync, writeFileSync });

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

/** Publish complete UTF-8 evidence exactly once without replacing its target. */
export function writePrivateNoReplaceFile(
  path,
  contents,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0 || typeof contents !== "string") {
    throw new TypeError("private output requires a non-empty path and UTF-8 text");
  }
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
  try {
    fileSystem.writeFileSync(descriptor, contents, { encoding: "utf8" });
    const opened = fileSystem.fstatSync(descriptor);
    const published = fileSystem.lstatSync(path);
    if (
      !regularSingleLink(opened)
      || opened.size !== Buffer.byteLength(contents, "utf8")
      || !regularSingleLink(published)
      || !sameIdentity(opened, published)
    ) {
      throw new Error("private output changed during exclusive publication");
    }
    return published;
  } finally {
    fileSystem.closeSync(descriptor);
  }
}
