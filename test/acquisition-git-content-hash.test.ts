import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  verifyAcquisitionTrackedBytes,
  verifyAcquisitionTrackedFileBytes,
} from "../scripts/lib/acquisition-git-preflight.mjs";

const SHA1_A = "a".repeat(40);
const TRACKED_CONTENTS = Buffer.from("tracked\n");

function gitBlobId(contents: Buffer, algorithm: "sha1" | "sha256" = "sha1") {
  return createHash(algorithm)
    .update(`blob ${contents.length}\0`)
    .update(contents)
    .digest("hex");
}

const TRACKED_SHA1 = gitBlobId(TRACKED_CONTENTS);
const TRACKED_SHA256 = gitBlobId(TRACKED_CONTENTS, "sha256");

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`Git fixture command terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`Git fixture command failed: git ${args.join(" ")}\n${result.stderr}`);
  }
  return result;
}

function gitResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 0,
    signal: null,
    error: undefined,
    stdout: "",
    stderr: "",
    ...overrides,
  };
}

function spawnSequence(...results: Array<Record<string, unknown>>) {
  const mock = vi.fn();
  results.forEach((result) => mock.mockReturnValueOnce(gitResult(result)));
  return mock;
}

function regularMetadata(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100644,
    size: 8,
    mtimeMs: 3,
    ctimeMs: 4,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function trackedRecord(
  path = "tracked.txt",
  objectId = SHA1_A,
  mode = "100644",
  stage = "0",
) {
  return `${mode} ${objectId} ${stage}\t${path}\0`;
}

function descriptorFileSystem({
  pathStates = [regularMetadata(), regularMetadata()],
  descriptorStates = [regularMetadata(), regularMetadata()],
  contents = TRACKED_CONTENTS,
  readResults,
  constants = { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
}: {
  pathStates?: Array<Record<string, unknown> | null>;
  descriptorStates?: Array<Record<string, unknown> | null>;
  contents?: Buffer;
  readResults?: number[];
  constants?: Record<string, number>;
} = {}) {
  const lstatSync = vi.fn();
  pathStates.forEach((state) => lstatSync.mockReturnValueOnce(state));
  const fstatSync = vi.fn();
  descriptorStates.forEach((state) => fstatSync.mockReturnValueOnce(state));
  let sourceOffset = 0;
  let readIndex = 0;
  const readSync = vi.fn((
    _descriptor: number,
    buffer: Buffer,
    bufferOffset: number,
    length: number,
  ) => {
    if (readResults) {
      const configured = readResults[readIndex] ?? 0;
      readIndex += 1;
      return configured;
    }
    const count = Math.min(length, contents.length - sourceOffset);
    if (count <= 0) {
      return 0;
    }
    contents.copy(buffer, bufferOffset, sourceOffset, sourceOffset + count);
    sourceOffset += count;
    return count;
  });
  return {
    constants,
    lstatSync,
    openSync: vi.fn(() => 17),
    fstatSync,
    readSync,
    closeSync: vi.fn(),
  };
}

describe("acquisition exact tracked-byte authentication", () => {
  it.each([undefined, "short", 7])("rejects invalid pinned file commits (%s)", (exactHead) => {
    expect(() => verifyAcquisitionTrackedFileBytes({ exactHead, path: "tracked.txt", bytes: "" }))
      .toThrow("exact acquisition tree commit must be a full Git SHA");
  });

  it.each([undefined, "", "x".repeat(4097)])("rejects invalid pinned file paths", (path) => {
    expect(() => verifyAcquisitionTrackedFileBytes({ exactHead: SHA1_A, path, bytes: "" }))
      .toThrow("tracked acquisition input path must be a bounded repository path");
  });

  it("rejects oversized caller-supplied pinned file bytes", () => {
    expect(() => verifyAcquisitionTrackedFileBytes({
      exactHead: SHA1_A,
      path: "tracked.txt",
      bytes: Buffer.alloc(32 * 1024 * 1024 + 1),
    })).toThrow("tracked acquisition input exceeds the acquisition file-byte limit");
  });

  it("fails closed when the pinned tree lookup fails or is not one exact path", () => {
    const failed = spawnSequence({ status: 1 });
    expect(() => verifyAcquisitionTrackedFileBytes({
      exactHead: SHA1_A,
      path: "tracked.txt",
      bytes: TRACKED_CONTENTS,
      spawnSyncImpl: failed,
    })).toThrow("tracked acquisition input source inspection failed");

    const missing = spawnSequence({ stdout: Buffer.alloc(0) });
    expect(() => verifyAcquisitionTrackedFileBytes({
      exactHead: SHA1_A,
      path: "tracked.txt",
      bytes: TRACKED_CONTENTS,
      spawnSyncImpl: missing,
    })).toThrow("tracked acquisition input is not one exact regular file");

    const otherPath = spawnSequence({
      stdout: Buffer.from(`100644 blob ${TRACKED_SHA1}\tother.txt\0`),
    });
    expect(() => verifyAcquisitionTrackedFileBytes({
      exactHead: SHA1_A,
      path: "tracked.txt",
      bytes: TRACKED_CONTENTS,
      spawnSyncImpl: otherPath,
    })).toThrow("tracked acquisition input is not one exact regular file");
  });

  it.each([
    ["sha1", SHA1_A, TRACKED_SHA1],
    ["sha256", "a".repeat(64), TRACKED_SHA256],
  ])("authenticates caller-supplied bytes with %s Git object identity", (_name, exactHead, objectId) => {
    const spawn = spawnSequence({
      stdout: Buffer.from(`100644 blob ${objectId}\ttracked.txt\0`),
    });
    expect(verifyAcquisitionTrackedFileBytes({
      exactHead,
      path: "tracked.txt",
      bytes: TRACKED_CONTENTS,
      spawnSyncImpl: spawn,
    })).toBe(objectId);
  });

  it("rejects caller-supplied bytes that differ from the pinned blob", () => {
    const spawn = spawnSequence({
      stdout: Buffer.from(`100644 blob ${TRACKED_SHA1}\ttracked.txt\0`),
    });
    expect(() => verifyAcquisitionTrackedFileBytes({
      exactHead: SHA1_A,
      path: "tracked.txt",
      bytes: "tampered\n",
      spawnSyncImpl: spawn,
    })).toThrow("tracked acquisition input bytes differ from the claimed acquisition commit's pinned Git tree");
  });

  it.skipIf(process.platform === "win32")(
    "rejects same-size content drift even when Git's stat cache reports a clean worktree",
    () => {
      const root = mkdtempSync(join(tmpdir(), "noema-acquisition-content-hash-"));
      const trackedPath = join(root, "tracked.txt");
      const oldTimestamp = new Date("2020-01-01T00:00:00.000Z");
      try {
        runGit(root, ["init", "--quiet"]);
        runGit(root, ["config", "core.trustctime", "false"]);
        runGit(root, ["config", "core.checkStat", "minimal"]);
        writeFileSync(trackedPath, "tracked\n", "utf8");
        utimesSync(trackedPath, oldTimestamp, oldTimestamp);
        runGit(root, ["add", "tracked.txt"]);
        runGit(root, [
          "-c",
          "user.name=Noema Tests",
          "-c",
          "user.email=noema-tests@example.invalid",
          "commit",
          "--quiet",
          "-m",
          "fixture",
        ]);
        const exactHead = String(runGit(root, ["rev-parse", "HEAD"]).stdout).trim();

        const committedMetadata = statSync(trackedPath);
        writeFileSync(trackedPath, "tamperd\n", "utf8");
        utimesSync(trackedPath, committedMetadata.atime, committedMetadata.mtime);

        const cachedComparison = spawnSync(
          "git",
          ["diff-files", "--quiet", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--"],
          { cwd: root, encoding: "utf8", timeout: 10_000 },
        );
        expect(cachedComparison.error).toBeUndefined();
        expect(cachedComparison.signal).toBeNull();
        expect(cachedComparison.status).toBe(0);

        expect(() => verifyAcquisitionTrackedBytes({ cwd: root, exactHead }))
          .toThrow("tracked checkout differs from its authenticated Git index bytes");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("accepts empty tracked indexes from null, string, Buffer, and typed-array output", () => {
    for (const stdout of [null, "", Buffer.alloc(0), new Uint8Array()]) {
      expect(verifyAcquisitionTrackedBytes({
        cwd: "/repo",
        spawnSyncImpl: spawnSequence({ stdout }),
      })).toBe(0);
    }
  });

  it("rejects unsupported output objects and non-ASCII index headers", () => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: {} }),
    })).toThrow("malformed output");

    const nonAsciiHeader = Buffer.concat([
      Buffer.from("100644 ", "ascii"),
      Buffer.from([0xff]),
      Buffer.from(`${SHA1_A.slice(1)} 0\ttracked.txt\0`, "ascii"),
    ]);
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: nonAsciiHeader }),
    })).toThrow("malformed output");
  });

  it("supports a filesystem-root worktree and SHA-256 object identity", () => {
    const contents = Buffer.from("tracked\n");
    const metadata = regularMetadata({ size: contents.length });
    const fileSystem = descriptorFileSystem({
      pathStates: [metadata, metadata],
      descriptorStates: [metadata, metadata],
      contents,
    });
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/",
      spawnSyncImpl: spawnSequence(
        { stdout: Buffer.from(trackedRecord("tmp/tracked.txt", TRACKED_SHA256)) },
      ),
      fileSystem: fileSystem as never,
    })).toBe(1);
  });

  it.each([
    regularMetadata({ isFile: undefined }),
    regularMetadata({ isSymbolicLink: undefined }),
    regularMetadata({ isFile: () => false }),
    regularMetadata({ isSymbolicLink: () => true }),
  ])("rejects invalid path metadata before opening", (metadata) => {
    const fileSystem = descriptorFileSystem({ pathStates: [metadata] });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("object type differs");
    expect(fileSystem.openSync).not.toHaveBeenCalled();
  });

  it.each([
    regularMetadata({ isFile: undefined }),
    regularMetadata({ isSymbolicLink: undefined }),
    regularMetadata({ isFile: () => false }),
    regularMetadata({ isSymbolicLink: () => true }),
    regularMetadata({ dev: 9 }),
    regularMetadata({ ino: 9 }),
    regularMetadata({ mode: 9 }),
    regularMetadata({ size: 9 }),
    regularMetadata({ mtimeMs: 9 }),
    regularMetadata({ ctimeMs: 9 }),
  ])("rejects descriptor identity or type drift before reading", (opened) => {
    const before = regularMetadata();
    const fileSystem = descriptorFileSystem({
      pathStates: [before],
      descriptorStates: [opened],
    });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("changed before raw-byte authentication");
    expect(fileSystem.readSync).not.toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it("rejects missing mode metadata and executable-bit drift", () => {
    for (const metadata of [
      regularMetadata({ mode: 1.5 }),
      regularMetadata({ mode: 0o100755 }),
    ]) {
      const fileSystem = descriptorFileSystem({
        pathStates: [metadata],
        descriptorStates: [metadata],
      });
      expect(() => verifyAcquisitionTrackedBytes({
        cwd: "/repo",
        spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
        fileSystem: fileSystem as never,
      })).toThrow(metadata.mode === 0o100755 ? "executable mode differs" : "object type differs");
    }
  });

  it("accepts the executable index mode when the descriptor owner-execute bit is present", () => {
    const contents = Buffer.from("tracked\n");
    const metadata = regularMetadata({ mode: 0o100755, size: contents.length });
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        { stdout: Buffer.from(trackedRecord("tracked.txt", TRACKED_SHA1, "100755")) },
      ),
      fileSystem: descriptorFileSystem({
        pathStates: [metadata, metadata],
        descriptorStates: [metadata, metadata],
        contents,
      }) as never,
    })).toBe(1);
  });

  it.each([
    12.5,
    -1,
    32 * 1024 * 1024 + 1,
  ])("rejects invalid or oversized descriptor size %s before allocating or hashing", (size) => {
    const metadata = regularMetadata({ size });
    const fileSystem = descriptorFileSystem({
      pathStates: [metadata],
      descriptorStates: [metadata],
    });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("file-byte limit");
    expect(fileSystem.readSync).not.toHaveBeenCalled();
  });

  it.each([
    [0.5, "invalid byte count"],
    [-1, "invalid byte count"],
    [10, "invalid byte count"],
  ])("rejects invalid descriptor read count %s", (readCount, message) => {
    const metadata = regularMetadata();
    const fileSystem = descriptorFileSystem({
      pathStates: [metadata],
      descriptorStates: [metadata],
      readResults: [readCount],
    });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow(message);
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it.each([
    ["dev", 9],
    ["ino", 9],
    ["mode", 9],
    ["size", 9],
    ["mtimeMs", 9],
    ["ctimeMs", 9],
  ])("rejects post-read descriptor metadata drift in %s", (field, changedValue) => {
    const before = regularMetadata();
    const after = regularMetadata({ [field]: changedValue });
    const fileSystem = descriptorFileSystem({
      pathStates: [before, before],
      descriptorStates: [before, after],
    });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("changed during raw-byte authentication");
  });

  it("rejects a short descriptor read and missing final path metadata", () => {
    const metadata = regularMetadata();
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: descriptorFileSystem({
        pathStates: [metadata, metadata],
        descriptorStates: [metadata, metadata],
        contents: Buffer.from("short"),
      }) as never,
    })).toThrow("changed during raw-byte authentication");

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: descriptorFileSystem({
        pathStates: [metadata, null],
        descriptorStates: [metadata, metadata],
      }) as never,
    })).toThrow("changed during raw-byte authentication");
  });

  it("rejects mismatched locally computed hash evidence after closing the descriptor", () => {
    const contents = TRACKED_CONTENTS;
    const metadata = regularMetadata({ size: contents.length });
    const fileSystem = descriptorFileSystem({
      pathStates: [metadata, metadata],
      descriptorStates: [metadata, metadata],
      contents,
    });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("authenticated Git index bytes");
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it("enforces the aggregate byte budget before reading the first over-budget file", () => {
    const paths = Array.from({ length: 9 }, (_, index) => `file-${index}.bin`);
    const fileSize = 32 * 1024 * 1024;
    const objectId = gitBlobId(Buffer.alloc(fileSize));
    const listing = Buffer.from(paths.map((path) => trackedRecord(path, objectId)).join(""));
    const spawn = vi.fn(() => gitResult({ stdout: listing }));
    const metadata = regularMetadata({ size: fileSize });
    let readCall = 0;
    const fileSystem = {
      constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
      lstatSync: () => metadata,
      openSync: () => 17,
      fstatSync: () => metadata,
      readSync: (
        _descriptor: number,
        _buffer: Buffer,
        _offset: number,
        length: number,
      ) => {
        readCall += 1;
        return readCall % 2 === 1 ? length - 1 : 0;
      },
      closeSync: () => undefined,
    };

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawn as never,
      fileSystem: fileSystem as never,
    })).toThrow("aggregate-byte limit");
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
