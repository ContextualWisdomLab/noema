import { resolve } from "node:path";
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
  nlink: number;
  file: boolean;
}>;

function metadata(overrides: MetadataOverrides = {}) {
  return {
    dev: overrides.dev ?? 11,
    ino: overrides.ino ?? 13,
    size: overrides.size ?? 2,
    mtimeMs: overrides.mtimeMs ?? 17,
    ctimeMs: overrides.ctimeMs ?? 19,
    nlink: overrides.nlink ?? 1,
    isFile: () => overrides.file ?? true,
  };
}

describe("external scheduler evidence descriptor post-read stability", () => {
  it.each([
    { label: "non-file metadata", finalMetadata: metadata({ file: false }) },
    { label: "link-count drift", finalMetadata: metadata({ nlink: 2 }) },
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

  it.each([
    { label: "missing leaf", retainedMetadata: null },
    { label: "non-file leaf", retainedMetadata: metadata({ file: false }) },
    { label: "link-count drift", retainedMetadata: metadata({ nlink: 2 }) },
    { label: "device drift", retainedMetadata: metadata({ dev: 99 }) },
    { label: "inode drift", retainedMetadata: metadata({ ino: 99 }) },
    { label: "size drift", retainedMetadata: metadata({ size: 3 }) },
    { label: "mtime drift", retainedMetadata: metadata({ mtimeMs: 23 }) },
    { label: "ctime drift", retainedMetadata: metadata({ ctimeMs: 29 }) },
  ])("rejects retained pathname $label after descriptor acceptance", async ({ retainedMetadata }) => {
    const cli = await loadCli();
    const closed: number[] = [];
    const fstatSync = vi
      .fn()
      .mockReturnValueOnce(metadata())
      .mockReturnValueOnce(metadata());
    const lstatSync = vi.fn().mockReturnValue(retainedMetadata);
    const io = {
      openSync: () => 31,
      fstatSync,
      lstatSync,
      readFileSync: () => Buffer.from("{}", "utf8"),
      closeSync: (descriptor: number) => closed.push(descriptor),
    };

    expect(() => cli.readExternalSchedulerEvidence("ignored.json", io)).toThrow(
      "retained pathname changed after it was read",
    );
    expect(closed).toEqual([31]);
    expect(lstatSync).toHaveBeenCalledTimes(1);
  });

  it("returns parsed evidence when a custom reader has no retained-path lstat capability", async () => {
    const cli = await loadCli();
    const closed: number[] = [];
    const fstatSync = vi
      .fn()
      .mockReturnValueOnce(metadata())
      .mockReturnValueOnce(metadata());
    const io = {
      openSync: () => 31,
      fstatSync,
      readFileSync: () => Buffer.from("{}", "utf8"),
      closeSync: (descriptor: number) => closed.push(descriptor),
    };

    expect(cli.readExternalSchedulerEvidence("ignored.json", io)).toEqual({});
    expect(fstatSync).toHaveBeenCalledTimes(2);
    expect(closed).toEqual([31]);
  });

  it("returns the resolved report path after a custom atomic publication succeeds", async () => {
    const cli = await loadCli();
    const reportPath = resolve("custom-scheduler-audit.json");
    const temporaryDirectory = resolve(".scheduler-audit-fixture");
    const io = {
      mkdirSync: vi.fn(),
      mkdtempSync: vi.fn().mockReturnValue(temporaryDirectory),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      rmSync: vi.fn(),
    };

    expect(cli.writeAtomicJson(reportPath, { status: "PASS" }, io)).toBe(reportPath);
    expect(io.writeFileSync).toHaveBeenCalledWith(
      resolve(temporaryDirectory, "report.json"),
      expect.stringContaining('"status": "PASS"'),
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    expect(io.renameSync).toHaveBeenCalledWith(
      resolve(temporaryDirectory, "report.json"),
      reportPath,
    );
    expect(io.rmSync).toHaveBeenCalledWith(
      temporaryDirectory,
      { recursive: true, force: true },
    );
  });

  it("returns parsed evidence only after the retained pathname remains the same safe inode", async () => {
    const cli = await loadCli();
    const closed: number[] = [];
    const fstatSync = vi
      .fn()
      .mockReturnValueOnce(metadata())
      .mockReturnValueOnce(metadata());
    const lstatSync = vi.fn().mockReturnValue(metadata());
    const io = {
      openSync: () => 31,
      fstatSync,
      lstatSync,
      readFileSync: () => Buffer.from("{}", "utf8"),
      closeSync: (descriptor: number) => closed.push(descriptor),
    };

    expect(cli.readExternalSchedulerEvidence("ignored.json", io)).toEqual({});
    expect(closed).toEqual([31]);
    expect(lstatSync).toHaveBeenCalledTimes(1);
  });
});
