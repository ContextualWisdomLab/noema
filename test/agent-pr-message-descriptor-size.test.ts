import { describe, expect, it, vi } from "vitest";
import { readRegularFileWithoutFollowingSymlinks } from "../scripts/prepare-agent-pr-message.mjs";

function metadata(size: number) {
  return {
    dev: 11,
    ino: 13,
    size,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

function fileSystem({
  pathSize = 4,
  openedSize = 4,
  bytes = Buffer.from("safe"),
} = {}) {
  return {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20 },
    lstatSync: vi.fn(() => metadata(pathSize)),
    openSync: vi.fn(() => 7),
    fstatSync: vi.fn(() => metadata(openedSize)),
    readFileSync: vi.fn(() => bytes),
    closeSync: vi.fn(),
  };
}

describe("agent PR metadata descriptor-size stability", () => {
  it("rejects an in-place size change between path inspection and descriptor validation", () => {
    const fs = fileSystem({ pathSize: 4, openedSize: 3, bytes: Buffer.from("safe") });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 10, fs)).toThrow(
      "PR_MESSAGE.md changed during validation",
    );
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });

  it("rejects a short descriptor read instead of accepting incomplete metadata", () => {
    const fs = fileSystem({ pathSize: 4, openedSize: 4, bytes: Buffer.from("saf") });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 10, fs)).toThrow(
      "PR_MESSAGE.md changed during validation",
    );
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });
});
