import { describe, expect, it, vi } from "vitest";
import { readBoundedReport } from "../scripts/normalize-commercial-readiness-evidence.mjs";

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
  };
}

describe("commercial-readiness evidence no-follow capability", () => {
  it.each([
    ["zero no-follow", { O_RDONLY: 0x10, O_NOFOLLOW: 0 }],
    ["negative no-follow", { O_RDONLY: 0x10, O_NOFOLLOW: -1 }],
    ["oversized no-follow", { O_RDONLY: 0x10, O_NOFOLLOW: 0x1_0000_0000 }],
    ["negative read-only", { O_RDONLY: -1, O_NOFOLLOW: 0x20 }],
    ["oversized read-only", { O_RDONLY: 0x1_0000_0000, O_NOFOLLOW: 0x20 }],
  ])("fails closed before open on %s", (_label, constants) => {
    const adapter = fileSystem(constants);

    expect(readBoundedReport("report.json", adapter)).toBeNull();
    expect(adapter.openSync).not.toHaveBeenCalled();
  });

  it("accepts O_RDONLY zero and passes only the reviewed flags", () => {
    const adapter = fileSystem({ O_RDONLY: 0, O_NOFOLLOW: 0x20, O_CREAT: 0x40 });

    expect(readBoundedReport("report.json", adapter)).toEqual(Buffer.from("safe"));
    expect(adapter.openSync).toHaveBeenCalledWith("report.json", 0x20);
    expect(adapter.closeSync).toHaveBeenCalledWith(7);
  });
});
