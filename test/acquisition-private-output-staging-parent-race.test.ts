import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

function fileMetadata(ino = 2) {
  return {
    dev: 1,
    ino,
    nlink: 1,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  };
}

function directoryMetadata({ symbolicLink = false } = {}) {
  return {
    dev: 1,
    ino: 3,
    nlink: 1,
    isFile: () => false,
    isDirectory: () => true,
    isSymbolicLink: () => symbolicLink,
  };
}

const adapterConstants = {
  O_RDONLY: 16,
  O_WRONLY: 1,
  O_CREAT: 2,
  O_EXCL: 4,
  O_NOFOLLOW: 8,
  O_NONBLOCK: 32,
};

describe("acquisition private output staging parent integrity", () => {
  it("never path-unlinks a staged inode after parent authority is lost", () => {
    let openCount = 0;
    let parentBecameSymbolicLink = false;
    const existing = fileMetadata(2);
    const staged = fileMetadata(4);
    const fileSystem = {
      constants: adapterConstants,
      lstatSync: vi.fn((path: string) => {
        if (path === "output") {
          return existing;
        }
        if (path.startsWith("output.tmp-")) {
          return staged;
        }
        return directoryMetadata({ symbolicLink: parentBecameSymbolicLink });
      }),
      openSync: vi.fn((path: string) => {
        openCount += 1;
        if (openCount === 2 && path.startsWith("output.tmp-")) {
          parentBecameSymbolicLink = true;
          return 18;
        }
        return 17;
      }),
      fstatSync: vi.fn((descriptor: number) => descriptor === 18 ? staged : existing),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile("output", "replacement", fileSystem as never))
      .toThrow("parent must be a real directory");
    expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(18);
    // A path-level lstat followed by path-level unlink is not deletion authority:
    // the parent can be replaced between those operations and redirect unlink.
    // Without an exact-object deletion primitive, fail closed by retaining the
    // failed staging inode for operator cleanup instead of deleting by pathname.
    expect(fileSystem.unlinkSync).not.toHaveBeenCalled();
  });

  it("does not path-unlink an unsafe staged descriptor without exact-object deletion authority", () => {
    let openCount = 0;
    const existing = fileMetadata(2);
    const unsafeStaged = { ...fileMetadata(4), nlink: 2 };
    const fileSystem = {
      constants: adapterConstants,
      lstatSync: vi.fn((path: string) => {
        if (path === "output") {
          return existing;
        }
        if (path.startsWith("output.tmp-")) {
          return unsafeStaged;
        }
        return directoryMetadata();
      }),
      openSync: vi.fn(() => {
        openCount += 1;
        return openCount === 1 ? 17 : 18;
      }),
      fstatSync: vi.fn((descriptor: number) => descriptor === 18 ? unsafeStaged : existing),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile("output", "replacement", fileSystem as never))
      .toThrow("acquisition staged output must remain a single-link regular file");
    expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
    expect(fileSystem.unlinkSync).not.toHaveBeenCalled();
  });

  it("does not path-unlink when a hard link appears after safe staging metadata was captured", () => {
    let openCount = 0;
    let stagedStatCount = 0;
    let hardLinkAppeared = false;
    const existing = fileMetadata(2);
    const staged = fileMetadata(4);
    const hardLinkedStaged = { ...staged, nlink: 2 };
    const fileSystem = {
      constants: adapterConstants,
      lstatSync: vi.fn((path: string) => {
        if (path === "output") {
          return existing;
        }
        if (path.startsWith("output.tmp-")) {
          return hardLinkAppeared ? hardLinkedStaged : staged;
        }
        return directoryMetadata();
      }),
      openSync: vi.fn(() => {
        openCount += 1;
        return openCount === 1 ? 17 : 18;
      }),
      fstatSync: vi.fn((descriptor: number) => {
        if (descriptor !== 18) {
          return existing;
        }
        stagedStatCount += 1;
        if (stagedStatCount === 2) {
          hardLinkAppeared = true;
        }
        return staged;
      }),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile("output", "replacement", fileSystem as never))
      .toThrow("acquisition staged output path changed before atomic replacement");
    expect(fileSystem.writeFileSync).toHaveBeenCalled();
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
    expect(fileSystem.unlinkSync).not.toHaveBeenCalled();
  });
});
