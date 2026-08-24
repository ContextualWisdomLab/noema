import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStableRegularFile } from "../scripts/lib/stable-file-evidence.mjs";

type Metadata = {
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
};

function metadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100600,
    size: 3,
    mtimeMs: 10,
    ctimeMs: 11,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function fakeFileSystem({
  pathMetadata = metadata(),
  openedMetadata = metadata(),
  finalMetadata = metadata(),
  finalPathMetadata = metadata(),
  chunks = [Buffer.from("abc")],
  constants = { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
}: {
  pathMetadata?: Metadata;
  openedMetadata?: Metadata;
  finalMetadata?: Metadata;
  finalPathMetadata?: Metadata;
  chunks?: Buffer[];
  constants?: { O_RDONLY?: number; O_NOFOLLOW?: number };
} = {}) {
  let statCalls = 0;
  let chunkIndex = 0;
  let closed = false;
  const fileSystem = {
    constants,
    lstatSync: () => (statCalls++ === 0 ? pathMetadata : finalPathMetadata),
    openSync: () => 7,
    fstatSync: () => (statCalls++ === 1 ? openedMetadata : finalMetadata),
    readSync: (_fd: number, target: Buffer, offset: number, length: number) => {
      const chunk = chunks[chunkIndex++];
      if (!chunk) return 0;
      const bounded = chunk.subarray(0, length);
      bounded.copy(target, offset);
      return bounded.length;
    },
    closeSync: () => {
      closed = true;
    },
  };
  return { fileSystem, wasClosed: () => closed };
}

describe("stable release file evidence", () => {
  it("reads exact bytes from a bounded regular file and rejects symlinked evidence paths", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-stable-release-file-"));
    try {
      const target = join(temp, "target.json");
      const link = join(temp, "link.json");
      writeFileSync(target, "abc", "utf8");
      symlinkSync(target, link);

      expect(readStableRegularFile(target, "release input", 16)).toEqual(Buffer.from("abc"));
      expect(() => readStableRegularFile(link, "release input", 16)).toThrow(/symbolic link|no-follow/i);

      const realParent = join(temp, "real-parent");
      const linkedParent = join(temp, "linked-parent");
      mkdirSync(realParent);
      writeFileSync(join(realParent, "nested.json"), "abc", "utf8");
      symlinkSync(realParent, linkedParent, "dir");

      expect(() =>
        readStableRegularFile(join(linkedParent, "nested.json"), "release input", 16),
      ).toThrow(/parent|symlink/i);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("fails closed when no-follow or read-only flags are unavailable", () => {
    const missingNoFollow = fakeFileSystem({ constants: { O_RDONLY: 0 } });
    expect(() =>
      readStableRegularFile("evidence", "release input", 16, missingNoFollow.fileSystem),
    ).toThrow(/no-follow/i);

    const invalidReadOnly = fakeFileSystem({ constants: { O_RDONLY: -1, O_NOFOLLOW: 1 } });
    expect(() =>
      readStableRegularFile("evidence", "release input", 16, invalidReadOnly.fileSystem),
    ).toThrow(/read-only/i);
  });

  it("rejects invalid arguments, malformed metadata, symlinks, non-files, and unsafe sizes", () => {
    expect(() => readStableRegularFile("", "release input", 16)).toThrow(/path/i);
    expect(() => readStableRegularFile("evidence", "", 16)).toThrow(/label/i);
    expect(() => readStableRegularFile("evidence", "release input", 0)).toThrow(/byte ceiling/i);

    for (const [pathMetadata, expected] of [
      [null as unknown as Metadata, /metadata is unavailable/i],
      [{ ...metadata(), isFile: undefined } as unknown as Metadata, /metadata is unavailable/i],
      [metadata({ size: Number.NaN }), /invalid byte size/i],
      [metadata({ size: -1 }), /invalid byte size/i],
      [metadata({ isSymbolicLink: () => true }), /symbolic link/i],
      [metadata({ isFile: () => false }), /regular file/i],
      [metadata({ size: 0 }), /empty/i],
      [metadata({ size: 17 }), /byte ceiling/i],
    ] as const) {
      const fake = fakeFileSystem({ pathMetadata });
      expect(() => readStableRegularFile("evidence", "release input", 16, fake.fileSystem)).toThrow(
        expected,
      );
    }
  });

  it("rejects path-to-descriptor identity drift and always closes the descriptor", () => {
    for (const openedMetadata of [
      metadata({ dev: 9 }),
      metadata({ ino: 9 }),
      metadata({ size: 2 }),
      metadata({ isFile: () => false }),
    ]) {
      const fake = fakeFileSystem({ openedMetadata });
      expect(() => readStableRegularFile("evidence", "release input", 16, fake.fileSystem)).toThrow(
        /changed before read|regular file/i,
      );
      expect(fake.wasClosed()).toBe(true);
    }
  });

  it("rejects streamed oversize and descriptor mutation while bytes are consumed", () => {
    const oversized = fakeFileSystem({
      pathMetadata: metadata({ size: 3 }),
      openedMetadata: metadata({ size: 3 }),
      chunks: [Buffer.from("abcd")],
    });
    expect(() => readStableRegularFile("evidence", "release input", 3, oversized.fileSystem)).toThrow(
      /exceeded.*byte ceiling/i,
    );
    expect(oversized.wasClosed()).toBe(true);

    for (const finalMetadata of [
      metadata({ dev: 9 }),
      metadata({ ino: 9 }),
      metadata({ mode: 0o100644 }),
      metadata({ size: 4 }),
      metadata({ mtimeMs: 12 }),
      metadata({ ctimeMs: 13 }),
      metadata({ isFile: () => false }),
    ]) {
      const fake = fakeFileSystem({ finalMetadata });
      expect(() => readStableRegularFile("evidence", "release input", 16, fake.fileSystem)).toThrow(
        /changed while being read|regular file/i,
      );
      expect(fake.wasClosed()).toBe(true);
    }
  });

  it("rejects pathname replacement after descriptor read even when accepted bytes are unchanged", () => {
    for (const finalPathMetadata of [
      metadata({ dev: 8 }),
      metadata({ ino: 8 }),
      metadata({ size: 4 }),
      metadata({ isSymbolicLink: () => true }),
      metadata({ isFile: () => false }),
    ]) {
      const fake = fakeFileSystem({ finalPathMetadata });
      expect(() => readStableRegularFile("evidence", "release input", 16, fake.fileSystem)).toThrow(
        /pathname changed|symbolic link|regular file/i,
      );
      expect(fake.wasClosed()).toBe(true);
    }
  });

  it("rejects short reads instead of hashing or parsing a partial file", () => {
    const fake = fakeFileSystem({
      pathMetadata: metadata({ size: 4 }),
      openedMetadata: metadata({ size: 4 }),
      finalMetadata: metadata({ size: 4 }),
      finalPathMetadata: metadata({ size: 4 }),
      chunks: [Buffer.from("abc")],
    });
    expect(() => readStableRegularFile("evidence", "release input", 16, fake.fileSystem)).toThrow(
      /byte count/i,
    );
    expect(fake.wasClosed()).toBe(true);
  });
});
