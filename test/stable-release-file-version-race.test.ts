import { describe, expect, it } from "vitest";
import { readStableRegularFile } from "../scripts/lib/stable-file-evidence.mjs";

type Metadata = {
  dev: number;
  ino: number;
  mode: number;
  size: number;
  nlink: number;
  mtimeMs: number;
  ctimeMs: number;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
};

function fileMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100600,
    size: 3,
    nlink: 1,
    mtimeMs: 10,
    ctimeMs: 11,
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

const parentMetadata: Metadata = {
  ...fileMetadata({ mode: 0o040700, size: 0 }),
  isDirectory: () => true,
  isFile: () => false,
};

function raceFileSystem({
  pathMetadata,
  openedMetadata,
  finalMetadata,
  finalPathMetadata,
}: {
  pathMetadata: Metadata;
  openedMetadata: Metadata;
  finalMetadata: Metadata;
  finalPathMetadata: Metadata;
}) {
  let leafStats = 0;
  let descriptorStats = 0;
  let readCount = 0;
  return {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
    lstatSync(path: string) {
      if (path === "evidence") {
        return leafStats++ === 0 ? pathMetadata : finalPathMetadata;
      }
      return parentMetadata;
    },
    openSync: () => 7,
    fstatSync: () => descriptorStats++ === 0 ? openedMetadata : finalMetadata,
    readSync(_fd: number, target: Buffer, offset: number) {
      if (readCount++ > 0) return 0;
      Buffer.from("abc").copy(target, offset);
      return 3;
    },
    closeSync: () => undefined,
  };
}

describe("stable release evidence file-version races", () => {
  it("rejects a same-inode file whose modification metadata changes between path stat and open", () => {
    const before = fileMetadata();
    const opened = fileMetadata({ mtimeMs: 12, ctimeMs: 13 });
    const fileSystem = raceFileSystem({
      pathMetadata: before,
      openedMetadata: opened,
      finalMetadata: opened,
      finalPathMetadata: opened,
    });

    expect(() => readStableRegularFile("evidence", "release input", 16, fileSystem)).toThrow(
      /changed before read/i,
    );
  });

  it("rejects a same-inode pathname version change after the final descriptor stat", () => {
    const stable = fileMetadata();
    const changedPath = fileMetadata({ mtimeMs: 12, ctimeMs: 13 });
    const fileSystem = raceFileSystem({
      pathMetadata: stable,
      openedMetadata: stable,
      finalMetadata: stable,
      finalPathMetadata: changedPath,
    });

    expect(() => readStableRegularFile("evidence", "release input", 16, fileSystem)).toThrow(
      /pathname changed/i,
    );
  });
});
