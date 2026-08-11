import { describe, expect, it, vi } from "vitest";
import { readBoundedReport } from "../scripts/normalize-commercial-readiness-evidence.mjs";

type MetadataOverrides = Partial<{
  dev: number;
  ino: number;
  size: number;
  file: boolean;
  symlink: boolean;
}>;

function metadata(overrides: MetadataOverrides = {}) {
  return {
    dev: overrides.dev ?? 11,
    ino: overrides.ino ?? 13,
    size: overrides.size ?? 4,
    isFile: () => overrides.file ?? true,
    isSymbolicLink: () => overrides.symlink ?? false,
  };
}

function fileSystem(finalMetadata: ReturnType<typeof metadata>) {
  const fstatSync = vi
    .fn()
    .mockReturnValueOnce(metadata())
    .mockReturnValueOnce(finalMetadata);
  return {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20 },
    lstatSync: vi.fn(() => metadata()),
    openSync: vi.fn(() => 7),
    fstatSync,
    readFileSync: vi.fn(() => Buffer.from("safe")),
    closeSync: vi.fn(),
  };
}

describe("commercial-readiness descriptor post-read stability", () => {
  it.each([
    { label: "non-file metadata", finalMetadata: metadata({ file: false }) },
    { label: "device drift", finalMetadata: metadata({ dev: 99 }) },
    { label: "inode drift", finalMetadata: metadata({ ino: 99 }) },
    { label: "size drift", finalMetadata: metadata({ size: 5 }) },
  ])("rejects $label after the read", ({ finalMetadata }) => {
    const fs = fileSystem(finalMetadata);

    expect(readBoundedReport("report.json", fs)).toBeNull();
    expect(fs.fstatSync).toHaveBeenCalledTimes(2);
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });
});
