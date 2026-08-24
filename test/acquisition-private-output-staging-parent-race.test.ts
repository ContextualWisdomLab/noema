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

describe("acquisition private output staging parent integrity", () => {
  it("fails closed when a parent becomes a symbolic link after staging-file open", () => {
    let openCount = 0;
    let parentBecameSymbolicLink = false;
    const existing = fileMetadata(2);
    const staged = fileMetadata(4);
    const fileSystem = {
      constants: { O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8 },
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
  });
});
