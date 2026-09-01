import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

function fileMetadata(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100600,
    nlink: 1,
    size: 12,
    mtimeMs: 10,
    ctimeMs: 10,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function parentMetadata() {
  return {
    ...fileMetadata(),
    isFile: () => false,
    isDirectory: () => true,
  };
}

function newFileSystem({ writeFails = false } = {}) {
  const created = fileMetadata({ size: 0 });
  const written = fileMetadata({ size: 12, mtimeMs: 11, ctimeMs: 11 });
  let outputReads = 0;
  let descriptorReads = 0;
  return {
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
        outputReads += 1;
        return outputReads === 1 ? null : written;
      }
      return parentMetadata();
    }),
    openSync: vi.fn(() => 17),
    fstatSync: vi.fn(() => {
      descriptorReads += 1;
      return descriptorReads === 1 ? created : written;
    }),
    fchmodSync: vi.fn(),
    ftruncateSync: vi.fn(),
    writeFileSync: vi.fn(() => {
      if (writeFails) throw new Error("write failed");
    }),
    closeSync: vi.fn(() => {
      throw new Error("close failed");
    }),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
  };
}

describe("acquisition private output close failure cleanup", () => {
  it("neutralizes an identity-matched new output when close fails after a successful write", () => {
    const fileSystem = newFileSystem();

    expect(() => writeAcquisitionPrivateFile("output", "replacement\n", fileSystem as never))
      .toThrow("close failed");
    expect(fileSystem.ftruncateSync).toHaveBeenCalled();
    expect(fileSystem.unlinkSync).not.toHaveBeenCalledWith("output");
  });

  it("preserves the original write error while neutralizing when close also fails", () => {
    const fileSystem = newFileSystem({ writeFails: true });

    expect(() => writeAcquisitionPrivateFile("output", "replacement\n", fileSystem as never))
      .toThrow("write failed");
    expect(fileSystem.ftruncateSync).toHaveBeenCalled();
    expect(fileSystem.unlinkSync).not.toHaveBeenCalledWith("output");
  });
});
