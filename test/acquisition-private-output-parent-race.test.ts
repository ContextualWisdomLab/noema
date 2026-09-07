import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

function fileMetadata() {
  return {
    dev: 1,
    ino: 2,
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

describe("acquisition private output parent integrity", () => {
  it("fails closed without path cleanup when a parent becomes a symbolic link after exclusive leaf open", () => {
    let parentBecameSymbolicLink = false;
    const fileSystem = {
      constants: {
        O_RDONLY: 16,
        O_WRONLY: 1,
        O_CREAT: 2,
        O_EXCL: 4,
        O_NOFOLLOW: 8,
        O_NONBLOCK: 32,
      },
      lstatSync: vi.fn((path: string) => {
        if (path === "output") {
          return parentBecameSymbolicLink ? fileMetadata() : null;
        }
        return directoryMetadata({ symbolicLink: parentBecameSymbolicLink });
      }),
      openSync: vi.fn(() => {
        parentBecameSymbolicLink = true;
        return 17;
      }),
      fstatSync: vi.fn(() => fileMetadata()),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("parent must be a real directory");
    expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
    // Once parent authority is lost, lstat(path) followed by unlink(path) cannot
    // prove that deletion still targets the inode opened above. Retain the
    // failed leaf for operator cleanup instead of deleting by pathname.
    expect(fileSystem.unlinkSync).not.toHaveBeenCalled();
  });
});