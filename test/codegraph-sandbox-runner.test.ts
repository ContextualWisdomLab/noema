import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  copyInputTree,
  normalizeChangedPaths,
  runBoundedCommand,
} from "../.github/codegraph/sandbox-runner.mjs";

function tempRoot(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("CodeGraph sandbox entrypoint", () => {
  it("copies only regular input files, excludes .git, and strips executable bits", async () => {
    const root = tempRoot("noema-sandbox-copy-");
    const input = join(root, "input");
    const output = join(root, "output");
    mkdirSync(join(input, "src"), { recursive: true });
    mkdirSync(join(input, ".git"), { recursive: true });
    writeFileSync(join(input, "src", "app.ts"), "export const value = 1;\n");
    chmodSync(join(input, "src", "app.ts"), 0o755);
    writeFileSync(join(input, ".git", "config"), "credential = secret\n");

    const result = await copyInputTree(input, output, {
      maxFiles: 10,
      maxFileBytes: 1024,
      maxTotalBytes: 4096,
    });

    expect(result).toEqual({ files: 1, totalBytes: 24 });
    expect(readFileSync(join(output, "src", "app.ts"), "utf8")).toContain("value = 1");
    expect(() => lstatSync(join(output, ".git"))).toThrow();
    expect(lstatSync(join(output, "src", "app.ts")).mode & 0o777).toBe(0o600);
  });

  it("rejects symbolic links", async () => {
    const root = tempRoot("noema-sandbox-symlink-");
    const input = join(root, "input");
    const output = join(root, "output");
    mkdirSync(input);
    writeFileSync(join(input, "target.txt"), "target");
    symlinkSync("target.txt", join(input, "link.txt"));

    await expect(copyInputTree(input, output)).rejects.toThrow("symbolic link");
  });

  it("does not follow a file swapped to a symlink after metadata validation", async () => {
    const root = tempRoot("noema-sandbox-file-race-");
    const input = join(root, "input");
    const output = join(root, "output");
    const sourcePath = join(input, "source.txt");
    const outsidePath = join(root, "outside-secret.txt");
    mkdirSync(input);
    writeFileSync(sourcePath, "safe");
    writeFileSync(outsidePath, "outside-secret");

    let swapped = false;
    const limits = {
      maxFiles: 10,
      get maxFileBytes() {
        if (!swapped) {
          unlinkSync(sourcePath);
          symlinkSync(outsidePath, sourcePath);
          swapped = true;
        }
        return 1024;
      },
      maxTotalBytes: 4096,
    };

    await expect(copyInputTree(input, output, limits)).rejects.toThrow();
    expect(swapped).toBe(true);
    expect(() => readFileSync(join(output, "source.txt"), "utf8")).toThrow();
  });

  it("rejects excessive file count", async () => {
    const root = tempRoot("noema-sandbox-count-");
    const input = join(root, "input");
    const output = join(root, "output");
    mkdirSync(input);
    writeFileSync(join(input, "one.txt"), "1");
    writeFileSync(join(input, "two.txt"), "2");

    await expect(
      copyInputTree(input, output, {
        maxFiles: 1,
        maxFileBytes: 1024,
        maxTotalBytes: 4096,
      }),
    ).rejects.toThrow("file-count quota");
  });

  it("rejects an oversized individual file", async () => {
    const root = tempRoot("noema-sandbox-file-size-");
    const input = join(root, "input");
    const output = join(root, "output");
    mkdirSync(input);
    writeFileSync(join(input, "large.txt"), "12345");

    await expect(
      copyInputTree(input, output, {
        maxFiles: 10,
        maxFileBytes: 4,
        maxTotalBytes: 4096,
      }),
    ).rejects.toThrow("per-file byte quota");
  });

  it("rejects excessive aggregate bytes", async () => {
    const root = tempRoot("noema-sandbox-total-size-");
    const input = join(root, "input");
    const output = join(root, "output");
    mkdirSync(input);
    writeFileSync(join(input, "one.txt"), "123");
    writeFileSync(join(input, "two.txt"), "456");

    await expect(
      copyInputTree(input, output, {
        maxFiles: 10,
        maxFileBytes: 10,
        maxTotalBytes: 5,
      }),
    ).rejects.toThrow("aggregate byte quota");
  });

  it("normalizes a bounded changed-file scope", () => {
    expect(normalizeChangedPaths(["src/app.ts", " test/app.test.ts "])).toEqual([
      "src/app.ts",
      "test/app.test.ts",
    ]);
    expect(() => normalizeChangedPaths("src/app.ts")).toThrow("JSON array");
    expect(() => normalizeChangedPaths([1])).toThrow("strings");
    expect(() => normalizeChangedPaths(Array.from({ length: 81 }, (_, index) => `f${index}`))).toThrow(
      "80 paths",
    );
    expect(() => normalizeChangedPaths(["x".repeat(301)])).toThrow("300 characters");
    expect(() => normalizeChangedPaths(["bad\0path"])).toThrow("NUL");
  });

  it("runs a command without a shell and returns bounded output", async () => {
    const result = await runBoundedCommand(
      process.execPath,
      ["-e", "process.stdout.write('ready')"],
      {
        cwd: process.cwd(),
        timeoutMs: 1000,
        maxOutputBytes: 64,
      },
    );

    expect(result).toBe("ready");
  });

  it("rejects non-zero commands with their bounded diagnostics", async () => {
    await expect(
      runBoundedCommand(
        process.execPath,
        ["-e", "process.stderr.write('bad'); process.exit(7)"],
        {
          cwd: process.cwd(),
          timeoutMs: 1000,
          maxOutputBytes: 64,
        },
      ),
    ).rejects.toThrow("exited 7: bad");
  });

  it("kills commands that exceed the output budget", async () => {
    await expect(
      runBoundedCommand(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(1000))"],
        {
          cwd: process.cwd(),
          timeoutMs: 1000,
          maxOutputBytes: 32,
        },
      ),
    ).rejects.toThrow("output exceeded 32 bytes");
  });

  it("kills commands that exceed the wall-clock budget", async () => {
    await expect(
      runBoundedCommand(
        process.execPath,
        ["-e", "setTimeout(() => {}, 10000)"],
        {
          cwd: process.cwd(),
          timeoutMs: 25,
          maxOutputBytes: 64,
        },
      ),
    ).rejects.toThrow("timed out after 25ms");
  });
});
