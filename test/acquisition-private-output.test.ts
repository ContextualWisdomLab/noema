import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertAcquisitionPrivatePathParents,
  writeAcquisitionPrivateFile,
} from "../scripts/lib/acquisition-private-output.mjs";

function metadata(overrides: Record<string, unknown> = {}) {
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

function parentDirectoryMetadata(overrides: Record<string, unknown> = {}) {
  return metadata({
    isFile: () => false,
    isDirectory: () => true,
    ...overrides,
  });
}

function mockFileSystem({
  before = null,
  opened = metadata(),
  afterDescriptor = metadata(),
  afterPath = metadata(),
  chmodError = null,
  writeError = null,
}: {
  before?: ReturnType<typeof metadata> | null;
  opened?: ReturnType<typeof metadata>;
  afterDescriptor?: ReturnType<typeof metadata>;
  afterPath?: ReturnType<typeof metadata>;
  chmodError?: Error | null;
  writeError?: Error | null;
} = {}) {
  let leafReads = 0;
  const lstat = vi.fn((path: string) => {
    if (path === "output") {
      leafReads += 1;
      return leafReads === 1 ? before : afterPath;
    }
    return parentDirectoryMetadata();
  });
  const fstat = vi.fn()
    .mockReturnValueOnce(opened)
    .mockReturnValueOnce(afterDescriptor);
  return {
    constants: { O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8 },
    lstatSync: lstat,
    openSync: vi.fn(() => 17),
    fstatSync: fstat,
    ftruncateSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(() => {
      if (writeError) {
        throw writeError;
      }
    }),
    fchmodSync: vi.fn(() => {
      if (chmodError) {
        throw chmodError;
      }
    }),
    closeSync: vi.fn(),
  };
}

describe("acquisition private output", () => {
  it("rejects invalid call contracts and filesystems without O_NOFOLLOW", () => {
    expect(() => writeAcquisitionPrivateFile("", "value")).toThrow(TypeError);
    expect(() => writeAcquisitionPrivateFile("path", null as never)).toThrow(TypeError);
    expect(() => assertAcquisitionPrivatePathParents("")).toThrow(TypeError);
    expect(() => writeAcquisitionPrivateFile("path", "value", {
      constants: { O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4 },
    } as never)).toThrow("no-follow filesystem support");
  });

  it("allows absent parent components while still walking to the filesystem root", () => {
    const fileSystem = { lstatSync: vi.fn(() => null) };
    expect(() => assertAcquisitionPrivatePathParents("missing/parents/evidence.json", fileSystem as never))
      .not.toThrow();
    expect(fileSystem.lstatSync).toHaveBeenCalled();
  });

  it.each([
    parentDirectoryMetadata({ isDirectory: undefined }),
    parentDirectoryMetadata({ isSymbolicLink: undefined }),
    parentDirectoryMetadata({ isDirectory: () => false }),
    parentDirectoryMetadata({ isSymbolicLink: () => true }),
  ])("rejects unsafe existing parent metadata", (unsafeParent) => {
    const fileSystem = { lstatSync: vi.fn(() => unsafeParent) };
    expect(() => assertAcquisitionPrivatePathParents("parent/evidence.json", fileSystem as never))
      .toThrow("parent must be a real directory");
  });

  it.skipIf(process.platform === "win32")("creates and overwrites only owner-readable single-link regular files", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-private-output-"));
    const output = join(temp, "evidence.json");
    try {
      writeAcquisitionPrivateFile(output, "first\n");
      expect(readFileSync(output, "utf8")).toBe("first\n");
      expect(statSync(output).mode & 0o777).toBe(0o600);

      chmodSync(output, 0o644);
      writeAcquisitionPrivateFile(output, "second\n");
      expect(readFileSync(output, "utf8")).toBe("second\n");
      expect(statSync(output).mode & 0o777).toBe(0o600);
      expect(lstatSync(output).nlink).toBe(1);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("rejects a hard-linked existing output before truncation", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-private-hardlink-"));
    const target = join(temp, "target.txt");
    const output = join(temp, "evidence.json");
    try {
      writeFileSync(target, "sentinel\n", "utf8");
      linkSync(target, output);
      expect(() => writeAcquisitionPrivateFile(output, "replacement\n"))
        .toThrow("single-link regular file");
      expect(readFileSync(target, "utf8")).toBe("sentinel\n");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("rejects symbolic-link parent directories before creating or modifying target leaves", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-private-parent-symlink-"));
    const targetDirectory = join(temp, "target-directory");
    const linkedParent = join(temp, "linked-parent");
    const existingTarget = join(targetDirectory, "existing.json");
    const newTarget = join(targetDirectory, "new.json");
    try {
      mkdirSync(targetDirectory);
      writeFileSync(existingTarget, "sentinel\n", "utf8");
      symlinkSync(targetDirectory, linkedParent, "dir");

      expect(() => writeAcquisitionPrivateFile(join(linkedParent, "new.json"), "replacement\n"))
        .toThrow("parent");
      expect(existsSync(newTarget)).toBe(false);

      expect(() => writeAcquisitionPrivateFile(join(linkedParent, "existing.json"), "replacement\n"))
        .toThrow("parent");
      expect(readFileSync(existingTarget, "utf8")).toBe("sentinel\n");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each([
    metadata({ isFile: undefined }),
    metadata({ isSymbolicLink: undefined }),
    metadata({ isFile: () => false }),
    metadata({ isSymbolicLink: () => true }),
    metadata({ nlink: 2 }),
  ])("rejects unsafe existing metadata before opening", (before) => {
    const fileSystem = mockFileSystem({ before });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("single-link regular file");
    expect(fileSystem.openSync).not.toHaveBeenCalled();
  });

  it("uses exclusive create, hardens permissions, and only then mutates content", () => {
    const fileSystem = mockFileSystem();
    writeAcquisitionPrivateFile("output", "value", fileSystem as never);
    expect(fileSystem.openSync).toHaveBeenCalledWith("output", 1 | 2 | 4 | 8, 0o600);
    expect(fileSystem.ftruncateSync).toHaveBeenCalledWith(17, 0);
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(17, "value", { encoding: "utf8" });
    expect(fileSystem.fchmodSync).toHaveBeenCalledWith(17, 0o600);
    expect(fileSystem.fchmodSync.mock.invocationCallOrder[0])
      .toBeLessThan(fileSystem.ftruncateSync.mock.invocationCallOrder[0]);
    expect(fileSystem.fchmodSync.mock.invocationCallOrder[0])
      .toBeLessThan(fileSystem.writeFileSync.mock.invocationCallOrder[0]);
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it("leaves existing content untouched when owner-only permission hardening fails", () => {
    const fileSystem = mockFileSystem({
      before: metadata(),
      chmodError: new Error("permission hardening failed"),
    });
    expect(() => writeAcquisitionPrivateFile("output", "replacement", fileSystem as never))
      .toThrow("permission hardening failed");
    expect(fileSystem.ftruncateSync).not.toHaveBeenCalled();
    expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it("opens an existing file without truncation flags and verifies its descriptor identity first", () => {
    const before = metadata();
    const fileSystem = mockFileSystem({ before });
    writeAcquisitionPrivateFile("output", "value", fileSystem as never);
    expect(fileSystem.openSync).toHaveBeenCalledWith("output", 1 | 8, 0o600);
    expect(fileSystem.ftruncateSync).toHaveBeenCalledOnce();
  });

  it.each([
    metadata({ isFile: () => false }),
    metadata({ isSymbolicLink: () => true }),
    metadata({ nlink: 2 }),
    metadata({ dev: 9 }),
    metadata({ ino: 9 }),
  ])("fails before truncation when an opened existing path no longer matches", (opened) => {
    const fileSystem = mockFileSystem({ before: metadata(), opened });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("changed before writing");
    expect(fileSystem.ftruncateSync).not.toHaveBeenCalled();
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it.each([
    { afterDescriptor: metadata({ isFile: () => false }), afterPath: metadata() },
    { afterDescriptor: metadata(), afterPath: metadata({ isSymbolicLink: () => true }) },
    { afterDescriptor: metadata({ nlink: 2 }), afterPath: metadata() },
    { afterDescriptor: metadata(), afterPath: metadata({ nlink: 2 }) },
    { afterDescriptor: metadata(), afterPath: metadata({ dev: 9 }) },
    { afterDescriptor: metadata(), afterPath: metadata({ ino: 9 }) },
  ])("fails closed when output identity or regular-file status changes after writing", (state) => {
    const fileSystem = mockFileSystem(state);
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("changed while writing");
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });

  it("closes the descriptor when writing fails", () => {
    const fileSystem = mockFileSystem({ writeError: new Error("write failed") });
    expect(() => writeAcquisitionPrivateFile("output", "value", fileSystem as never))
      .toThrow("write failed");
    expect(fileSystem.closeSync).toHaveBeenCalledWith(17);
  });
});
