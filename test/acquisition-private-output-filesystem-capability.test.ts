import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

function fileMetadata() {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100600,
    size: 5,
    mtimeMs: 1,
    ctimeMs: 1,
    nlink: 1,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  };
}

function directoryMetadata() {
  return {
    ...fileMetadata(),
    isFile: () => false,
    isDirectory: () => true,
  };
}

describe("acquisition private output filesystem capability", () => {
  it("rejects adapters without non-blocking cleanup support before output creation", () => {
    let outputReads = 0;
    const openSync = vi.fn(() => 17);
    const fileSystem = {
      constants: {
        O_RDONLY: 16,
        O_WRONLY: 1,
        O_CREAT: 2,
        O_EXCL: 4,
        O_NOFOLLOW: 8,
      },
      lstatSync: vi.fn((path: string) => {
        if (path === "output") {
          outputReads += 1;
          return outputReads === 1 ? null : fileMetadata();
        }
        return directoryMetadata();
      }),
      openSync,
      fstatSync: vi.fn(() => fileMetadata()),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("non-blocking filesystem support");
    expect(openSync).not.toHaveBeenCalled();
  });
});
