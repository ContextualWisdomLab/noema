import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

const constants = {
  O_WRONLY: 1,
  O_CREAT: 2,
  O_EXCL: 4,
  O_NOFOLLOW: 8,
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

describe("acquisition private-output existing-target metadata", () => {
  it("does not mutate the trusted existing target before a replacement commits", () => {
    const targetPath = "/tmp/noema-acquisition/report.json";
    const existing = fileMetadata(10);
    const staged = fileMetadata(20);
    const io = {
      constants,
      lstatSync: vi.fn((path: string) => {
        if (path === targetPath) return existing;
        if (path.includes(".tmp-")) return staged;
        return directoryMetadata();
      }),
      openSync: vi.fn((path: string) => (path.includes(".tmp-") ? 42 : 41)),
      fstatSync: vi.fn((descriptor: number) => (descriptor === 41 ? existing : staged)),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn((descriptor: number) => {
        if (descriptor === 42) throw new Error("staged write failed");
      }),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeAcquisitionPrivateFile(targetPath, "replacement", io)).toThrow(
      "staged write failed",
    );
    expect(io.fchmodSync).not.toHaveBeenCalledWith(41, 0o600);
    expect(io.renameSync).not.toHaveBeenCalled();
  });
});
