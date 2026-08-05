import { join } from "node:path";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  parsePositiveLimit,
  readRegularFileWithoutFollowingSymlinks,
  runCli,
  runMain,
  writePrivateFile,
} from "../scripts/prepare-agent-pr-message.mjs";

interface SyntheticMetadata {
  dev: number;
  ino: number;
  size: number;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

function metadata(
  overrides: Partial<{
    dev: number;
    ino: number;
    size: number;
    file: boolean;
    symlink: boolean;
  }> = {},
): SyntheticMetadata {
  return {
    dev: overrides.dev ?? 11,
    ino: overrides.ino ?? 13,
    size: overrides.size ?? 4,
    isFile: () => overrides.file ?? true,
    isSymbolicLink: () => overrides.symlink ?? false,
  };
}

function fileSystem(overrides: Record<string, unknown> = {}) {
  const linked = metadata();
  return {
    lstatSync: vi.fn(() => linked),
    openSync: vi.fn(() => 7),
    fstatSync: vi.fn(() => linked),
    readFileSync: vi.fn(() => Buffer.from("safe")),
    closeSync: vi.fn(),
    writeFileSync: vi.fn(),
    ...overrides,
  };
}

describe("agent PR metadata internal safety contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts only finite positive safe decimal limits", () => {
    expect(parsePositiveLimit("120", "LIMIT")).toBe(120);

    for (const value of [undefined, "", "0", "-1", "1.5", "01", "9".repeat(32)]) {
      expect(() => parsePositiveLimit(value, "LIMIT")).toThrow(
        "LIMIT must be a positive decimal integer",
      );
    }
  });

  it.each([
    { linked: metadata({ file: false }), label: "non-file" },
    { linked: metadata({ symlink: true }), label: "symlink" },
  ])("rejects a $label before opening it", ({ linked }) => {
    const fs = fileSystem({ lstatSync: vi.fn(() => linked) });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 10, fs)).toThrow(
      "PR_MESSAGE.md must be a regular non-symlink file",
    );
    expect(fs.openSync).not.toHaveBeenCalled();
  });

  it("rejects an oversized path before opening it", () => {
    const fs = fileSystem({ lstatSync: vi.fn(() => metadata({ size: 11 })) });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 10, fs)).toThrow(
      "PR_MESSAGE.md exceeds the combined byte budget",
    );
    expect(fs.openSync).not.toHaveBeenCalled();
  });

  it.each([
    { opened: metadata({ file: false }), label: "non-file descriptor" },
    { opened: metadata({ dev: 99 }), label: "device replacement" },
    { opened: metadata({ ino: 99 }), label: "inode replacement" },
  ])("rejects a $label and closes the descriptor", ({ opened }) => {
    const fs = fileSystem({ fstatSync: vi.fn(() => opened) });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 10, fs)).toThrow(
      "PR_MESSAGE.md changed during validation",
    );
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });

  it("rejects bytes that grow beyond the post-open budget", () => {
    const fs = fileSystem({
      readFileSync: vi.fn(() => Buffer.from("too-large")),
    });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 4, fs)).toThrow(
      "PR_MESSAGE.md exceeds the combined byte budget",
    );
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });

  it("returns exact bytes and closes the validated descriptor", () => {
    const expected = Buffer.from("safe");
    const fs = fileSystem({ readFileSync: vi.fn(() => expected) });

    expect(readRegularFileWithoutFollowingSymlinks("input", 4, fs)).toBe(expected);
    expect(fs.closeSync).toHaveBeenCalledWith(7);
  });

  it("does not close an unassigned descriptor when opening fails", () => {
    const fs = fileSystem({
      openSync: vi.fn(() => {
        throw new Error("open failed");
      }),
    });

    expect(() => readRegularFileWithoutFollowingSymlinks("input", 10, fs)).toThrow(
      "open failed",
    );
    expect(fs.closeSync).not.toHaveBeenCalled();
  });

  it("writes owner-only output without replacement", () => {
    const fs = fileSystem();

    writePrivateFile("output", "validated", fs);

    expect(fs.writeFileSync).toHaveBeenCalledWith("output", "validated", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  });

  it.each([
    [],
    ["source"],
    ["source", "title"],
  ])("rejects incomplete CLI arguments %j", (args) => {
    expect(() => runCli(args, {}, fileSystem())).toThrow(
      "Usage: prepare-agent-pr-message.mjs PR_MESSAGE.md pr-title.txt pr-body.md",
    );
  });

  it("validates limits, reads once, and writes both CLI outputs", () => {
    const writes: Array<[string, string, Record<string, unknown>]> = [];
    const fs = fileSystem({
      lstatSync: vi.fn(() => metadata({ size: 31 })),
      fstatSync: vi.fn(() => metadata({ size: 31 })),
      readFileSync: vi.fn(() => Buffer.from("feat: direct contract\nBody")),
      writeFileSync: vi.fn((path, value, options) => {
        writes.push([String(path), String(value), options]);
      }),
    });

    runCli(
      ["source", "title-output", "body-output"],
      { MAX_PR_TITLE_BYTES: "120", MAX_PR_BODY_BYTES: "20000" },
      fs,
    );

    expect(writes).toEqual([
      ["title-output", "feat: direct contract", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      }],
      ["body-output", "Body", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      }],
    ]);
  });

  it("returns success without emitting a diagnostic", () => {
    const writeError = vi.fn();

    expect(runMain(() => undefined, writeError)).toBe(0);
    expect(writeError).not.toHaveBeenCalled();
  });

  it("reports Error diagnostics without a stack trace", () => {
    const writeError = vi.fn();

    expect(runMain(() => {
      throw new Error("bounded failure");
    }, writeError)).toBe(1);
    expect(writeError).toHaveBeenCalledWith("bounded failure");
  });

  it("uses a stable diagnostic for non-Error failures", () => {
    const writeError = vi.fn();

    expect(runMain(() => {
      throw "untrusted failure";
    }, writeError)).toBe(1);
    expect(writeError).toHaveBeenCalledWith("PR metadata parsing failed");
  });

  it("keeps the executable adapter bound to the production module path", () => {
    const source = join(process.cwd(), "scripts", "prepare-agent-pr-message.mjs");

    expect(source).toMatch(/scripts[/\\]prepare-agent-pr-message\.mjs$/u);
  });
});
