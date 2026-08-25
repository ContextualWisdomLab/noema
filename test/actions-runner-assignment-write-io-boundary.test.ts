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
});
