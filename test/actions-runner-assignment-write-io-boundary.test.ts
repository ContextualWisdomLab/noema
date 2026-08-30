import { describe, expect, it, vi } from "vitest";
import { writeReportAtomically } from "../scripts/actions-runner-assignment-audit.mjs";

const constants = {
  O_RDONLY: 0,
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

describe("runner-assignment report filesystem authority", () => {
  it("uses the injected filesystem seam and canonical private-output replacement", () => {
    const existing = fileMetadata(10);
    const staged = fileMetadata(20);
    let fstatCall = 0;
    let renamed = false;
    const io = {
      constants,
      lstatSync: vi.fn((path: string) => {
        if (path.endsWith("actions-runner-assignment-audit.json")) {
          return renamed ? staged : existing;
        }
        if (path.includes(".tmp-")) return staged;
        return directoryMetadata();
      }),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => 41),
      fstatSync: vi.fn(() => {
        fstatCall += 1;
        return fstatCall === 1 ? existing : staged;
      }),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(() => {
        renamed = true;
      }),
      unlinkSync: vi.fn(),
    };

    expect(writeReportAtomically({ status: "PASS" }, io)).toContain("actions-runner-assignment-audit.json");
    expect(io.lstatSync).toHaveBeenCalled();
    expect(io.mkdirSync).toHaveBeenCalledOnce();
    expect(io.renameSync).toHaveBeenCalledOnce();
  });

  it("fails closed if a report parent becomes a symlink after the staging leaf opens", () => {
    const existing = fileMetadata(10);
    const staged = fileMetadata(20);
    const symlink = {
      isDirectory: () => false,
      isSymbolicLink: () => true,
    };
    let fstatCall = 0;
    let stagingLeafOpened = false;
    const io = {
      constants,
      lstatSync: vi.fn((path: string) => {
        if (!path.endsWith("actions-runner-assignment-audit.json") && !path.includes(".tmp-")) {
          return stagingLeafOpened ? symlink : directoryMetadata();
        }
        if (path.endsWith("actions-runner-assignment-audit.json")) return existing;
        return staged;
      }),
      mkdirSync: vi.fn(),
      openSync: vi.fn((path: string) => {
        if (path.includes(".tmp-")) stagingLeafOpened = true;
        return 41;
      }),
      fstatSync: vi.fn(() => {
        fstatCall += 1;
        return fstatCall === 1 ? existing : staged;
      }),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeReportAtomically({ status: "PASS" }, io)).toThrow(
      "acquisition output parent must be a real directory without symbolic links",
    );
    expect(io.renameSync).not.toHaveBeenCalled();
  });

  it("fails closed if the staged report pathname is replaced before atomic rename", () => {
    const existing = fileMetadata(10);
    const staged = fileMetadata(20);
    const replacement = fileMetadata(21);
    let fstatCall = 0;
    let stagedLeafCreated = false;
    const io = {
      constants,
      lstatSync: vi.fn((path: string) => {
        if (path.endsWith("actions-runner-assignment-audit.json")) return existing;
        if (path.includes(".tmp-") && stagedLeafCreated) return replacement;
        return directoryMetadata();
      }),
      mkdirSync: vi.fn(),
      openSync: vi.fn((path: string) => {
        if (path.includes(".tmp-")) stagedLeafCreated = true;
        return 41;
      }),
      fstatSync: vi.fn(() => {
        fstatCall += 1;
        return fstatCall === 1 ? existing : staged;
      }),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    expect(() => writeReportAtomically({ status: "PASS" }, io)).toThrow(
      "acquisition staged output path changed before atomic replacement",
    );
    expect(io.renameSync).not.toHaveBeenCalled();
  });
});
