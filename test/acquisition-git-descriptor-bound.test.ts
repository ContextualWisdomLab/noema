import { describe, expect, it, vi } from "vitest";
import { verifyAcquisitionTrackedBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

const OBJECT_ID = "a".repeat(40);

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
  const spawn = vi.fn();
  results.forEach((result) => spawn.mockReturnValueOnce(gitResult(result)));
  return spawn;
}

function trackedRecord(path = "tracked.txt", mode = "100644") {
  return `${mode} ${OBJECT_ID} 0\t${path}\0`;
}

function regularMetadata(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100644,
    size: 8,
    mtimeMs: 10,
    ctimeMs: 11,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function descriptorFileSystem({
  pathStates = [regularMetadata(), regularMetadata()],
  descriptorStates = [regularMetadata(), regularMetadata()],
  contents = Buffer.from("tracked\n"),
  constants = { O_RDONLY: 0, O_NOFOLLOW: 0x20000 },
}: {
  pathStates?: Array<Record<string, unknown>>;
  descriptorStates?: Array<Record<string, unknown>>;
  contents?: Buffer;
  constants?: Record<string, number>;
} = {}) {
  const lstatSync = vi.fn();
  pathStates.forEach((state) => lstatSync.mockReturnValueOnce(state));
  const fstatSync = vi.fn();
  descriptorStates.forEach((state) => fstatSync.mockReturnValueOnce(state));
  let offset = 0;
  const readSync = vi.fn((
    _descriptor: number,
    buffer: Buffer,
    bufferOffset: number,
    length: number,
  ) => {
    const count = Math.min(length, contents.length - offset);
    if (count <= 0) {
      return 0;
    }
    contents.copy(buffer, bufferOffset, offset, offset + count);
    offset += count;
    return count;
  });
  return {
    constants,
    lstatSync,
    openSync: vi.fn(() => 17),
    fstatSync,
    readSync,
    closeSync: vi.fn(),
    readlinkSync: vi.fn(),
  };
}

describe("acquisition descriptor-bound tracked-byte verification", () => {
  it("rejects invalid UTF-8 tracked path bytes before filesystem resolution", () => {
    const listing = Buffer.concat([
      Buffer.from(`100644 ${OBJECT_ID} 0\t`, "ascii"),
      Buffer.from([0xff]),
      Buffer.from([0]),
    ]);
    const fileSystem = descriptorFileSystem();

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: listing }),
      fileSystem: fileSystem as never,
    })).toThrow("valid UTF-8");
    expect(fileSystem.lstatSync).not.toHaveBeenCalled();
  });

  it("opens a regular file with no-follow semantics and hashes only descriptor-read bytes", () => {
    const contents = Buffer.from("tracked\n");
    const metadata = regularMetadata({ size: contents.length });
    const fileSystem = descriptorFileSystem({
      pathStates: [metadata, metadata],
      descriptorStates: [metadata, metadata],
      contents,
    });
    const spawn = spawnSequence(
      { stdout: Buffer.from(trackedRecord()) },
      { stdout: `${OBJECT_ID}\n` },
    );

    expect(verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawn,
      fileSystem: fileSystem as never,
    })).toBe(1);
    expect(fileSystem.openSync).toHaveBeenCalledWith("/repo/tracked.txt", 0x20000);
    expect(fileSystem.readSync).toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
    expect(spawn).toHaveBeenLastCalledWith(
      "git",
      ["hash-object", "--stdin"],
      expect.objectContaining({ input: contents }),
    );
  });

  it("rejects a pathname swap before reading when the opened descriptor identity differs", () => {
    const original = regularMetadata();
    const replacement = regularMetadata({ ino: 9 });
    const fileSystem = descriptorFileSystem({
      pathStates: [original],
      descriptorStates: [replacement],
    });

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("changed before raw-byte authentication");
    expect(fileSystem.readSync).not.toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it("rejects growth after the descriptor size check without hashing beyond the bound", () => {
    const before = regularMetadata({ size: 8 });
    const after = regularMetadata({ size: 9 });
    const fileSystem = descriptorFileSystem({
      pathStates: [before, after],
      descriptorStates: [before, after],
      contents: Buffer.from("123456789"),
    });

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("changed during raw-byte authentication");
    expect(fileSystem.readSync).toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it("rejects executable-mode drift independently of blob contents", () => {
    const nonExecutable = regularMetadata({ mode: 0o100644 });
    const fileSystem = descriptorFileSystem({
      pathStates: [nonExecutable],
      descriptorStates: [nonExecutable],
    });

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({
        stdout: Buffer.from(trackedRecord("tracked.txt", "100755")),
      }),
      fileSystem: fileSystem as never,
    })).toThrow("executable mode differs");
    expect(fileSystem.readSync).not.toHaveBeenCalled();
  });

  it("fails closed when no-follow descriptor support is unavailable", () => {
    const fileSystem = descriptorFileSystem({ constants: { O_RDONLY: 0 } });

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: Buffer.from(trackedRecord()) }),
      fileSystem: fileSystem as never,
    })).toThrow("no-follow filesystem support");
    expect(fileSystem.openSync).not.toHaveBeenCalled();
  });

  it("rejects tracked symbolic links until they can be descriptor-bound", () => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({
        stdout: Buffer.from(trackedRecord("linked", "120000")),
      }),
      fileSystem: descriptorFileSystem() as never,
    })).toThrow("unsupported object mode");
  });
});
