import { describe, expect, it, vi } from "vitest";
import { writeReportAtomically } from "../scripts/actions-runner-assignment-audit.mjs";

describe("runner-assignment report filesystem authority", () => {
  it("uses the injected filesystem seam for parent-path validation and report writes", () => {
    const directoryMetadata = {
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    const io = {
      lstatSync: vi.fn(() => directoryMetadata),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => 41),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(() => { throw new Error("already renamed"); }),
      randomUUID: vi.fn(() => "uuid"),
    };

    expect(writeReportAtomically({ status: "PASS" }, io)).toContain("actions-runner-assignment-audit.json");
    expect(io.lstatSync).toHaveBeenCalled();
    expect(io.mkdirSync).toHaveBeenCalledOnce();
    expect(io.renameSync).toHaveBeenCalledOnce();
  });

  it("fails closed if a report parent becomes a symlink after the staging leaf opens", () => {
    const directoryMetadata = {
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    const symlinkMetadata = {
      isDirectory: () => false,
      isSymbolicLink: () => true,
    };
    let stagingLeafOpened = false;
    const io = {
      lstatSync: vi.fn(() => stagingLeafOpened ? symlinkMetadata : directoryMetadata),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => {
        stagingLeafOpened = true;
        return 41;
      }),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
      randomUUID: vi.fn(() => "uuid"),
    };

    expect(() => writeReportAtomically({ status: "PASS" }, io)).toThrow(
      "acquisition output parent must be a real directory without symbolic links",
    );
    expect(io.writeFileSync).not.toHaveBeenCalled();
    expect(io.renameSync).not.toHaveBeenCalled();
  });

  it("fails closed if the staged report pathname is replaced before atomic rename", () => {
    const directoryMetadata = {
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    const existingTargetMetadata = {
      dev: 1,
      ino: 10,
      nlink: 1,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    const stagedDescriptorMetadata = {
      dev: 1,
      ino: 20,
      nlink: 1,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    const replacedStagedPathMetadata = {
      dev: 1,
      ino: 21,
      nlink: 1,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    let fstatCall = 0;
    let stagedLeafCreated = false;
    const io = {
      constants: {
        O_WRONLY: 1,
        O_CREAT: 2,
        O_EXCL: 4,
        O_NOFOLLOW: 8,
      },
      lstatSync: vi.fn((path: string) => {
        if (path.endsWith("actions-runner-assignment-audit.json")) {
          return existingTargetMetadata;
        }
        if (path.includes(".tmp-") && stagedLeafCreated) {
          return replacedStagedPathMetadata;
        }
        return directoryMetadata;
      }),
      mkdirSync: vi.fn(),
      openSync: vi.fn((path: string) => {
        if (path.includes(".tmp-")) stagedLeafCreated = true;
        return 41;
      }),
      fstatSync: vi.fn(() => {
        fstatCall += 1;
        return fstatCall === 1 ? existingTargetMetadata : stagedDescriptorMetadata;
      }),
      fchmodSync: vi.fn(),
      ftruncateSync: vi.fn(),
      writeFileSync: vi.fn(),
      closeSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
      randomUUID: vi.fn(() => "uuid"),
    };

    expect(() => writeReportAtomically({ status: "PASS" }, io)).toThrow(
      "acquisition staged output path changed before atomic replacement",
    );
    expect(io.renameSync).not.toHaveBeenCalled();
  });
});
