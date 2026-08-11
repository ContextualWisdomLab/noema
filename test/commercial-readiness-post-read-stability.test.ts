import { describe, expect, it, vi } from "vitest";
import { readBoundedReport } from "../scripts/normalize-commercial-readiness-evidence.mjs";

function metadata(size: number) {
  return {
    dev: 11,
    ino: 13,
    size,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

describe("commercial-readiness descriptor post-read stability", () => {
  it("rejects evidence whose descriptor size changes after the read", () => {
    const fstatSync = vi
      .fn()
      .mockReturnValueOnce(metadata(4))
      .mockReturnValueOnce(metadata(5));
    const fileSystem = {
      constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20 },
      lstatSync: vi.fn(() => metadata(4)),
      openSync: vi.fn(() => 7),
      fstatSync,
      readFileSync: vi.fn(() => Buffer.from("safe")),
      closeSync: vi.fn(),
    };

    expect(readBoundedReport("report.json", fileSystem)).toBeNull();
    expect(fstatSync).toHaveBeenCalledTimes(2);
    expect(fileSystem.closeSync).toHaveBeenCalledWith(7);
  });
});
