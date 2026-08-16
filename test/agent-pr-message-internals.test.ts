import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  executeDefaultAgentPrMessageCli,
  normalizeLineEndings,
  parsePositiveLimit,
  readRegularFileWithoutFollowingSymlinks,
  runAgentPrMessageCli,
  runAgentPrMessageEntrypoint,
  setAgentPrMessageCliExitCode,
  utf8Length,
  writeAgentPrMessageCliError,
  writePrivateFile,
} from "../scripts/prepare-agent-pr-message.mjs";

interface SyntheticMetadata {
  dev: number;
  ino: number;
  size: number;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

const temporaryDirectories: string[] = [];

/** Create and register one private temporary directory for filesystem tests. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-agent-pr-internals-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** Build deterministic file metadata for descriptor and replacement-boundary tests. */
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

/** Build an injectable synchronous filesystem double with overridable operations. */
function fileSystem(overrides: Record<string, unknown> = {}) {
  const linked = metadata();
  return {
    constants: { O_RDONLY: 0x10, O_NOFOLLOW: 0x20 },
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
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("measures UTF-8 bytes and normalizes legacy line endings", () => {
    expect(utf8Length("가a")).toBe(4);
    expect(normalizeLineEndings("a\r\nb\rc\n")).toBe("a\nb\nc\n");
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
    { args: undefined },
    { args: "source title body" },
    { args: [] },
    { args: ["source"] },
    { args: ["source", "title"] },
    { args: ["source", "title", "body", "extra"] },
  ] as Array<{ args: unknown }>)(
    "rejects invalid CLI arguments $args",
    ({ args }) => {
      const fs = fileSystem();

      expect(() => runAgentPrMessageCli(args as string[], {}, fs)).toThrow(
        "Usage: prepare-agent-pr-message.mjs PR_MESSAGE.md pr-title.txt pr-body.md",
      );
    },
  );

  it("can be imported when Node has no script argv entry", () => {
    const moduleUrl = new URL(
      "../scripts/prepare-agent-pr-message.mjs",
      import.meta.url,
    ).href;

    expect(() => execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `process.argv.length = 1; await import(${JSON.stringify(moduleUrl)});`,
      ],
      { encoding: "utf8" },
    )).not.toThrow();
  });

  it("validates limits, reads once, and writes both CLI outputs", () => {
    const writes: Array<[string, string, Record<string, unknown>]> = [];
    const fs = fileSystem({
      lstatSync: vi.fn(() => metadata({ size: 26 })),
      fstatSync: vi.fn(() => metadata({ size: 26 })),
      readFileSync: vi.fn(() => Buffer.from("feat: direct contract\nBody")),
      writeFileSync: vi.fn((path, value, options) => {
        writes.push([String(path), String(value), options]);
      }),
    });

    runAgentPrMessageCli(
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

  it("executes the default CLI against the process arguments and environment", () => {
    const directory = temporaryDirectory();
    const source = join(directory, "PR_MESSAGE.md");
    const titlePath = join(directory, "title.txt");
    const bodyPath = join(directory, "body.md");
    writeFileSync(source, "feat: default adapter\nDefault body", { mode: 0o600 });
    const previousArgv = process.argv;
    const previousTitleLimit = process.env.MAX_PR_TITLE_BYTES;
    const previousBodyLimit = process.env.MAX_PR_BODY_BYTES;

    try {
      process.argv = [process.execPath, "prepare-agent-pr-message.mjs", source, titlePath, bodyPath];
      process.env.MAX_PR_TITLE_BYTES = "120";
      process.env.MAX_PR_BODY_BYTES = "20000";

      executeDefaultAgentPrMessageCli();

      expect(readFileSync(titlePath, "utf8")).toBe("feat: default adapter");
      expect(readFileSync(bodyPath, "utf8")).toBe("Default body");
    } finally {
      process.argv = previousArgv;
      if (previousTitleLimit === undefined) delete process.env.MAX_PR_TITLE_BYTES;
      else process.env.MAX_PR_TITLE_BYTES = previousTitleLimit;
      if (previousBodyLimit === undefined) delete process.env.MAX_PR_BODY_BYTES;
      else process.env.MAX_PR_BODY_BYTES = previousBodyLimit;
    }
  });

  it("writes the bounded production diagnostic", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    writeAgentPrMessageCliError("bounded failure\n");

    expect(write).toHaveBeenCalledWith("bounded failure\n");
  });

  it("sets the production process exit code", () => {
    const previousExitCode = process.exitCode;
    try {
      setAgentPrMessageCliExitCode(1);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("does nothing for an imported module", () => {
    const cli = vi.fn();
    const writeError = vi.fn();
    const setExitCode = vi.fn();

    runAgentPrMessageEntrypoint(false, cli, writeError, setExitCode);

    expect(cli).not.toHaveBeenCalled();
    expect(writeError).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("runs a direct invocation without emitting an error", () => {
    const cli = vi.fn();
    const writeError = vi.fn();
    const setExitCode = vi.fn();

    runAgentPrMessageEntrypoint(true, cli, writeError, setExitCode);

    expect(cli).toHaveBeenCalledOnce();
    expect(writeError).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("reports Error diagnostics without a stack trace", () => {
    const writeError = vi.fn();
    const setExitCode = vi.fn();

    runAgentPrMessageEntrypoint(true, () => {
      throw new Error("bounded failure");
    }, writeError, setExitCode);

    expect(writeError).toHaveBeenCalledWith("bounded failure\n");
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("uses a stable diagnostic for non-Error failures", () => {
    const writeError = vi.fn();
    const setExitCode = vi.fn();

    runAgentPrMessageEntrypoint(true, () => {
      throw "untrusted failure";
    }, writeError, setExitCode);

    expect(writeError).toHaveBeenCalledWith("PR metadata parsing failed\n");
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
