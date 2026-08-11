import { describe, expect, it, vi } from "vitest";
import { readRegularFileWithoutFollowingSymlinks } from "../scripts/prepare-agent-pr-message.mjs";

function metadata() {
  return {
    dev: 11,
    ino: 13,
    size: 4,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

function fileSystem(constants: Record<string, number | undefined>) {
  const stable = metadata();
  return {
    constants,
    lstatSync: vi.fn(() => stable),
    openSync: vi.fn(() => 7),
    fstatSync: vi.fn(() => stable),
    readFileSync: vi.fn(() => Buffer.from("safe")),
    closeSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
}

describe("agent PR metadata no-follow capability", () => {
  it("fails closed before open when O_NOFOLLOW is unavailable", () => {
    const fs = fileSystem({ O_RDONLY: 0x10, O_NOFOLLOW: undefined });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 4, fs)).toThrow(
      "PR_MESSAGE.md requires no-follow file-open support",
    );
    expect(fs.openSync).not.toHaveBeenCalled();
  });

  it("uses only the reviewed injected read-only and no-follow flags", () => {
    const fs = fileSystem({ O_RDONLY: 0x10, O_NOFOLLOW: 0x20 });

    expect(readRegularFileWithoutFollowingSymlinks("input", 4, fs)).toEqual(
      Buffer.from("safe"),
    );
    expect(fs.openSync).toHaveBeenCalledWith("input", 0x30);
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });
});
