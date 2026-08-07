import { describe, expect, it, vi } from "vitest";
import { verifyAcquisitionTrackedBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

const OID = "a".repeat(40);

function result(stdout = "", status = 0) {
  return { status, signal: null, error: undefined, stdout, stderr: "" };
}

function metadata(size: number) {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100644,
    size,
    mtimeMs: 10,
    ctimeMs: 11,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

describe("acquisition tracked-byte read budgets", () => {
  it("refuses an oversized file before invoking Git hashing", () => {
    const spawn = vi.fn()
      .mockReturnValueOnce(result(`100644 ${OID} 0\tlarge.bin\0`))
      .mockReturnValueOnce(result(OID));
    const fileSystem = {
      lstatSync: vi.fn(() => metadata(32 * 1024 * 1024 + 1)),
      readlinkSync: vi.fn(),
    };

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawn,
      fileSystem: fileSystem as never,
    })).toThrow("file-byte limit");
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
