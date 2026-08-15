import { describe, expect, it, vi } from "vitest";

const cliUrl = new URL(
  "../scripts/external-scheduler-evidence-audit.mjs",
  import.meta.url,
);

async function loadCli() {
  return await import(cliUrl.href) as Record<string, any>;
}

type MetadataOverrides = Partial<{
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  file: boolean;
}>;

function metadata(overrides: MetadataOverrides = {}) {
  return {
    dev: overrides.dev ?? 11,
    ino: overrides.ino ?? 13,
    size: overrides.size ?? 2,
    mtimeMs: overrides.mtimeMs ?? 17,
    ctimeMs: overrides.ctimeMs ?? 19,
    isFile: () => overrides.file ?? true,
  };
}

describe("external scheduler evidence descriptor post-read stability", () => {
  it.each([
    { label: "non-file metadata", finalMetadata: metadata({ file: false }) },
    { label: "device drift", finalMetadata: metadata({ dev: 99 }) },
    { label: "inode drift", finalMetadata: metadata({ ino: 99 }) },
    { label: "size drift", finalMetadata: metadata({ size: 3 }) },
    { label: "mtime drift", finalMetadata: metadata({ mtimeMs: 23 }) },
    { label: "ctime drift", finalMetadata: metadata({ ctimeMs: 29 }) },
  ])("rejects $label after bytes are read", async ({ finalMetadata }) => {
    const cli = await loadCli();
    const closed: number[] = [];
    const fstatSync = vi
      .fn()
      .mockReturnValueOnce(metadata())
      .mockReturnValueOnce(finalMetadata);
    const io = {
      openSync: () => 31,
      fstatSync,
      readFileSync: () => Buffer.from("{}", "utf8"),
      closeSync: (descriptor: number) => closed.push(descriptor),
    };

    expect(() => cli.readExternalSchedulerEvidence("ignored.json", io)).toThrow(
      "changed while it was being read",
    );
    expect(fstatSync).toHaveBeenCalledTimes(2);
    expect(closed).toEqual([31]);
  });
});
