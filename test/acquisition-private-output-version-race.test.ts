import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

function fileMetadata(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100600,
    nlink: 1,
    size: 8,
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

function replacementFileSystem({
  opened = fileMetadata(),
  currentTarget = fileMetadata(),
}: {
  opened?: ReturnType<typeof fileMetadata>;
  currentTarget?: ReturnType<typeof fileMetadata>;
} = {}) {
  const before = fileMetadata();
  const staged = fileMetadata({ dev: 3, ino: 4, size: 12, mtimeMs: 20, ctimeMs: 20 });
  let targetReads = 0;
  let descriptorReads = 0;
  const lstatSync = vi.fn((path: string) => {
    if (path === "output") {
      targetReads += 1;
      if (targetReads === 1) {
        return before;
      }
      if (targetReads === 2) {
        return currentTarget;
      }
      return staged;
    }
    if (path.startsWith("output.tmp-")) {
      return staged;
    }
    return parentMetadata();
  });
  const fstatSync = vi.fn(() => {
    descriptorReads += 1;
    if (descriptorReads === 1) {
      return opened;
    }
    return staged;
  });
  return {
    constants: { O_RDONLY: 16, O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8 },
    lstatSync,
    openSync: vi.fn(() => 17),
    fstatSync,
    fchmodSync: vi.fn(),
    ftruncateSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    closeSync: vi.fn(),
  };
}

describe("acquisition private output replacement version authority", () => {
  it("rejects same-inode target mutation between pathname inspection and descriptor verification", () => {
    const fileSystem = replacementFileSystem({
      opened: fileMetadata({ mtimeMs: 11, ctimeMs: 11 }),
    });

    expect(() => writeAcquisitionPrivateFile("output", "replacement\n", fileSystem as never))
      .toThrow("changed before writing");
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
  });

  it("rejects same-inode target mutation before atomic replacement", () => {
    const fileSystem = replacementFileSystem({
      currentTarget: fileMetadata({ size: 9, mtimeMs: 12, ctimeMs: 12 }),
    });

    expect(() => writeAcquisitionPrivateFile("output", "replacement\n", fileSystem as never))
      .toThrow("changed before atomic replacement");
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
  });
});
