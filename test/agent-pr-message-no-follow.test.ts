import { describe, expect, it, vi } from "vitest";
import {
  readRegularFileWithoutFollowingSymlinks,
  resolveNoFollowOpenFlags,
} from "../scripts/prepare-agent-pr-message.mjs";

function regularFileMetadata() {
  return {
    dev: 11,
    ino: 13,
    size: 4,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

function fileSystem(openConstants: Record<string, number | undefined>) {
  const metadata = regularFileMetadata();
  return {
    constants: openConstants,
    lstatSync: vi.fn(() => metadata),
    openSync: vi.fn(() => 7),
    fstatSync: vi.fn(() => metadata),
    readFileSync: vi.fn(() => Buffer.from("safe")),
    closeSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
}

describe("agent PR metadata no-follow capability", () => {
  it("fails closed when O_NOFOLLOW is unavailable", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: undefined,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_RDONLY is unavailable", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: undefined,
      O_NOFOLLOW: 0x20,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_NOFOLLOW is zero", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: 0,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_NOFOLLOW is negative", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: -1,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_RDONLY is negative", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: -1,
      O_NOFOLLOW: 0x20,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_NOFOLLOW sets the JavaScript sign bit", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: 0x8000_0000,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_RDONLY sets the JavaScript sign bit", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x8000_0000,
      O_NOFOLLOW: 0x20,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_NOFOLLOW exceeds the unsigned 32-bit range", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: 0x1_0000_0000,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_RDONLY exceeds the unsigned 32-bit range", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x1_0000_0000,
      O_NOFOLLOW: 0x20,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("returns only the reviewed read-only and no-follow flags", () => {
    expect(resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: 0x20,
      O_CREAT: 0x40,
    })).toBe(0x30);
  });

  it("binds the reader to the injected no-follow capability before open", () => {
    const adapter = fileSystem({
      O_RDONLY: 0x10,
      O_NOFOLLOW: undefined,
    });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 4, adapter)).toThrow(
      "PR_MESSAGE.md requires no-follow file-open support",
    );
    expect(adapter.openSync).not.toHaveBeenCalled();
  });

  it("passes only the injected reviewed flags to openSync", () => {
    const adapter = fileSystem({
      O_RDONLY: 0x10,
      O_NOFOLLOW: 0x20,
      O_CREAT: 0x40,
    });

    expect(readRegularFileWithoutFollowingSymlinks("input", 4, adapter)).toEqual(
      Buffer.from("safe"),
    );
    expect(adapter.openSync).toHaveBeenCalledWith("input", 0x30);
    expect(adapter.closeSync).toHaveBeenCalledWith(7);
  });
});
