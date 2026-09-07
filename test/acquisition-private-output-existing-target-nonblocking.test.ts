import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

const constants = {
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_CREAT: 2,
  O_EXCL: 4,
  O_NOFOLLOW: 8,
  O_NONBLOCK: 16,
};

function directoryMetadata() {
  return {
    isDirectory: () => true,
    isSymbolicLink: () => false,
  };
}

function fileMetadata(ino: number) {
  return {
    dev: 1,
    ino,
    nlink: 1,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

function fifoMetadata() {
  return {
    dev: 1,
    ino: 99,
    nlink: 1,
    isFile: () => false,
    isSymbolicLink: () => false,
  };
}

describe("acquisition private-output existing-target open is non-blocking", () => {
  it("opens the pre-replacement verification read with O_NONBLOCK", () => {
    const targetPath = "/tmp/noema-acquisition/report.json";
    const existing = fileMetadata(10);
    const io = {
      constants,
      lstatSync: vi.fn((path: string) => (path === targetPath ? existing : directoryMetadata())),
      openSync: vi.fn(() => 41),
      fstatSync: vi.fn(() => existing),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(() => {
        throw new Error("stop after existing-target verification");
      }),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile(targetPath, "replacement", io)).toThrow();

    const existingTargetOpen = io.openSync.mock.calls.find(([path]) => path === targetPath);
    expect(existingTargetOpen).toBeDefined();
    const [, flags] = existingTargetOpen as [string, number];
    expect(flags & constants.O_NONBLOCK).toBe(constants.O_NONBLOCK);
  });

  it("fails closed instead of hanging when the target is replaced with a FIFO before the verification open", () => {
    // A locally authorized actor can race the pre-open lstat check (which still
    // observed a regular file) with a substitution of the target path for a
    // FIFO. Without O_NONBLOCK, a read-only open of a FIFO blocks until a
    // writer appears -- wedging this call, and the writer lease it holds,
    // indefinitely. With O_NONBLOCK the open returns immediately and the
    // descriptor-type check below fails closed instead.
    const targetPath = "/tmp/noema-acquisition/report.json";
    const existing = fileMetadata(10);
    const fifo = fifoMetadata();
    const io = {
      constants,
      lstatSync: vi.fn((path: string) => (path === targetPath ? existing : directoryMetadata())),
      openSync: vi.fn(() => 41),
      fstatSync: vi.fn(() => fifo),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile(targetPath, "replacement", io)).toThrow(
      "acquisition output path changed before writing",
    );
    expect(io.writeFileSync).not.toHaveBeenCalled();
  });
});
