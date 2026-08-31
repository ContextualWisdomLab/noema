import { randomUUID } from "node:crypto";
import { linkSync, lstatSync, unlinkSync, writeFileSync } from "node:fs";

const defaultFileSystem = Object.freeze({ linkSync, lstatSync, unlinkSync, writeFileSync });

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
  identifier = randomUUID,
) {
  if (typeof path !== "string" || path.length === 0 || typeof contents !== "string") {
    throw new TypeError("private output requires a non-empty path and UTF-8 text");
  }
  if (fileSystem.lstatSync(path, { throwIfNoEntry: false })) {
    throw new Error("private output target must not already exist");
  }

  const temporaryPath = `${path}.tmp-${process.pid}-${identifier()}`;
  let staged = null;
  let temporaryPresent = true;
  try {
    fileSystem.writeFileSync(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    staged = fileSystem.lstatSync(temporaryPath);
    if (!regularSingleLink(staged) || staged.size !== Buffer.byteLength(contents, "utf8")) {
      throw new Error("private output staging file is incomplete or unsafe");
    }

    fileSystem.linkSync(temporaryPath, path);
    const linked = fileSystem.lstatSync(path);
    if (!sameIdentity(staged, linked) || linked.nlink !== 2) {
      throw new Error("private output changed during no-replace publication");
    }
    fileSystem.unlinkSync(temporaryPath);
    temporaryPresent = false;

    const published = fileSystem.lstatSync(path);
    if (!regularSingleLink(published) || !sameIdentity(staged, published)) {
      throw new Error("private output changed after no-replace publication");
    }
    return published;
  } finally {
    const currentTemporary = temporaryPresent
      ? fileSystem.lstatSync(temporaryPath, { throwIfNoEntry: false })
      : null;
    if (currentTemporary && (!staged || sameIdentity(staged, currentTemporary))) {
      fileSystem.unlinkSync(temporaryPath);
    }
  }
}
