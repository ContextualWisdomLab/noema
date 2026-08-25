import { describe, expect, it, vi } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

function fileMetadata(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    nlink: 1,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function directoryMetadata() {
  return fileMetadata({
    isFile: () => false,
    isDirectory: () => true,
  });
}

function symlinkMetadata() {
  return fileMetadata({
    isFile: () => false,
    isDirectory: () => false,
    isSymbolicLink: () => true,
  });
}

function existingFileSystem({
  outputReads = [fileMetadata(), fileMetadata(), fileMetadata()],
  fstatReads = [fileMetadata(), fileMetadata(), fileMetadata()],
  stagedPathRead = fileMetadata(),
  writeError = null,
  unlinkError = null,
}: {
  outputReads?: Array<ReturnType<typeof fileMetadata> | null>;
  fstatReads?: Array<ReturnType<typeof fileMetadata>>;
  stagedPathRead?: ReturnType<typeof fileMetadata> | null;
  writeError?: Error | null;
  unlinkError?: Error | null;
} = {}) {
  let outputRead = 0;
  let fstatRead = 0;
  return {
    constants: { O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8 },
    lstatSync: vi.fn((path: string) => {
      if (path === "output") {
        return outputReads[outputRead++] ?? null;
      }
      if (path.startsWith("output.tmp-")) {
        return stagedPathRead;
      }
      return directoryMetadata();
    }),
    openSync: vi.fn(() => 17),
    fstatSync: vi.fn(() => fstatReads[fstatRead++] ?? fileMetadata()),
    fchmodSync: vi.fn(),
    ftruncateSync: vi.fn(),
    writeFileSync: vi.fn(() => {
      if (writeError) throw writeError;
    }),
    closeSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(() => {
      if (unlinkError) throw unlinkError;
    }),
  };
}

describe("acquisition private output atomic replacement coverage", () => {
  it("rejects an unsafe descriptor for a newly created target", () => {
    const fileSystem = existingFileSystem({
      outputReads: [null],
      fstatReads: [fileMetadata({ isFile: () => false })],
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("changed before writing");
  });

  it("revalidates new-target parents after the exclusive leaf opens and before writing", () => {
    let leafOpened = false;
    const fileSystem = existingFileSystem({ outputReads: [null, fileMetadata()] });
    fileSystem.openSync = vi.fn(() => {
      leafOpened = true;
      return 17;
    });
    fileSystem.lstatSync = vi.fn((path: string) => {
      if (path === "output") return leafOpened ? fileMetadata() : null;
      return leafOpened ? symlinkMetadata() : directoryMetadata();
    });

    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("parent must be a real directory without symbolic links");
    expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
  });

  it("revalidates replacement parents after the staging leaf opens and before writing", () => {
    let openCount = 0;
    let stagingOpened = false;
    const fileSystem = existingFileSystem();
    fileSystem.openSync = vi.fn(() => {
      openCount += 1;
      if (openCount === 2) stagingOpened = true;
      return 17;
    });
    fileSystem.lstatSync = vi.fn((path: string) => {
      if (path === "output") return fileMetadata();
      if (path.startsWith("output.tmp-")) return fileMetadata();
      return stagingOpened ? symlinkMetadata() : directoryMetadata();
    });

    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("parent must be a real directory without symbolic links");
    expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
  });

  it("fails closed when atomic rename support is missing", () => {
    const fileSystem = existingFileSystem();
    (fileSystem as { renameSync?: unknown }).renameSync = undefined;
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("atomic rename filesystem support");
  });

  it("fails closed when staged cleanup support is missing", () => {
    const fileSystem = existingFileSystem();
    (fileSystem as { unlinkSync?: unknown }).unlinkSync = undefined;
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("atomic rename filesystem support");
  });

  it("rejects unsafe staged-file metadata and removes the staged leaf", () => {
    const fileSystem = existingFileSystem({
      fstatReads: [fileMetadata(), fileMetadata({ nlink: 2 })],
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("staged output must remain a single-link regular file");
    expect(fileSystem.unlinkSync).toHaveBeenCalledOnce();
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
  });

  it("rejects staged descriptor identity changes during the write", () => {
    const fileSystem = existingFileSystem({
      fstatReads: [fileMetadata(), fileMetadata(), fileMetadata({ ino: 9 })],
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("staged output must remain a single-link regular file");
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
    expect(fileSystem.unlinkSync).toHaveBeenCalledOnce();
  });

  it("rejects a staged pathname replacement without unlinking the replacement", () => {
    const fileSystem = existingFileSystem({
      stagedPathRead: fileMetadata({ ino: 9 }),
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("staged output path changed before atomic replacement");
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
    expect(fileSystem.unlinkSync).not.toHaveBeenCalled();
  });

  it("rejects a disappeared staged pathname without inventing cleanup authority", () => {
    const fileSystem = existingFileSystem({ stagedPathRead: null });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("staged output path changed before atomic replacement");
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
    expect(fileSystem.unlinkSync).not.toHaveBeenCalled();
  });

  it("rejects a target that disappears before atomic replacement", () => {
    const fileSystem = existingFileSystem({
      outputReads: [fileMetadata(), null],
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("changed before atomic replacement");
    expect(fileSystem.unlinkSync).toHaveBeenCalledOnce();
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
  });

  it("rejects a target whose identity changes before atomic replacement", () => {
    const fileSystem = existingFileSystem({
      outputReads: [fileMetadata(), fileMetadata({ ino: 9 })],
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("changed before atomic replacement");
    expect(fileSystem.renameSync).not.toHaveBeenCalled();
  });

  it("rejects an unsafe final path after atomic replacement", () => {
    const fileSystem = existingFileSystem({
      outputReads: [fileMetadata(), fileMetadata(), fileMetadata({ isFile: () => false })],
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("changed during atomic replacement");
    expect(fileSystem.renameSync).toHaveBeenCalledOnce();
  });

  it("rejects a final path whose identity differs from the staged descriptor", () => {
    const fileSystem = existingFileSystem({
      outputReads: [fileMetadata(), fileMetadata(), fileMetadata({ dev: 9 })],
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("changed during atomic replacement");
    expect(fileSystem.renameSync).toHaveBeenCalledOnce();
  });

  it("preserves the original staged-write error when cleanup also fails", () => {
    const fileSystem = existingFileSystem({
      writeError: new Error("write failed"),
      unlinkError: new Error("cleanup failed"),
    });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("write failed");
    expect(fileSystem.unlinkSync).toHaveBeenCalledOnce();
  });
});
