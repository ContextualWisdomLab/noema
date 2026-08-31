import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeReceiptOnce } from "../scripts/release-publication-receipt.mjs";

function fileSystem(overrides: Record<string, unknown> = {}) {
  return {
    closeSync,
    constants,
    fstatSync,
    ftruncateSync,
    lstatSync,
    openSync,
    writeFileSync,
    ...overrides,
  };
}

describe("release publication receipt output", () => {
  it("publishes once through an exclusive no-follow descriptor", () => {
    const source = readFileSync("scripts/release-publication-receipt.mjs", "utf8");

    expect(source).toContain("function writeReceiptOnce");
    expect(source).toContain('["O_WRONLY", "O_CREAT", "O_EXCL", "O_NOFOLLOW"]');
    expect(source).toContain("fileSystem.writeFileSync(descriptor, content");
    expect(source).toContain("writeReceiptOnce(args.outputPath");
    expect(source).not.toContain("writeFileSync(args.outputPath");
    expect(source).not.toContain("existsSync(args.outputPath)");
    expect(source).not.toContain("renameSync(");
  });

  it("leaves a failed partial write non-authoritative until an operator removes it", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-release-partial-")));
    const output = join(directory, "receipt.json");
    try {
      const failedWrite = fileSystem({
        writeFileSync(descriptor: number, _content: string, options: object) {
          writeFileSync(descriptor, "partial", options);
          throw new Error("injected write failure");
        },
      });

      expect(() => writeReceiptOnce(output, "complete\n", failedWrite))
        .toThrow("injected write failure");
      expect(readFileSync(output, "utf8")).toBe("");
      expect(() => writeReceiptOnce(output, "complete\n", fileSystem()))
        .toThrow();

      unlinkSync(output);
      writeReceiptOnce(output, "complete\n", fileSystem());
      expect(readFileSync(output, "utf8")).toBe("complete\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a pathname that no longer names the opened output descriptor", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-release-postcheck-")));
    const output = join(directory, "receipt.json");
    let targetReads = 0;
    try {
      const postCheckFailure = fileSystem({
        lstatSync(path: string, options?: object) {
          const metadata = lstatSync(path, options);
          if (path === output && metadata && ++targetReads === 1) {
            return Object.assign(
              Object.create(Object.getPrototypeOf(metadata)),
              metadata,
              { size: metadata.size + 1 },
            );
          }
          return metadata;
        },
      });

      expect(() => writeReceiptOnce(output, "complete\n", postCheckFailure))
        .toThrow("changed during exclusive publication");
      expect(existsSync(output)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects replacement of the authorized output parent before the exclusive open", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-release-parent-swap-")));
    const output = join(directory, "receipt.json");
    let parentReads = 0;
    try {
      const swappedParent = fileSystem({
        lstatSync(path: string, options?: object) {
          const metadata = lstatSync(path, options);
          if (path === directory && metadata && ++parentReads > 1) {
            return Object.assign(
              Object.create(Object.getPrototypeOf(metadata)),
              metadata,
              { ino: metadata.ino + 1 },
            );
          }
          return metadata;
        },
      });

      expect(() => writeReceiptOnce(output, "complete\n", swappedParent))
        .toThrow("parent authority changed during exclusive publication");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports when a failed receipt cannot be truncated", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-release-cleanup-fail-")));
    const output = join(directory, "receipt.json");
    try {
      const failedCleanup = fileSystem({
        writeFileSync(descriptor: number, _content: string, options: object) {
          writeFileSync(descriptor, "partial", options);
          throw new Error("injected write failure");
        },
        ftruncateSync() {
          throw new Error("injected truncate failure");
        },
      });

      expect(() => writeReceiptOnce(output, "complete\n", failedCleanup))
        .toThrow("operator removal is required");
      expect(readFileSync(output, "utf8")).toBe("partial");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("truncates an otherwise complete receipt when descriptor close fails", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-release-close-fail-")));
    const output = join(directory, "receipt.json");
    let closeCalls = 0;
    try {
      const failedClose = fileSystem({
        closeSync(descriptor: number) {
          if (closeCalls++ === 0) throw new Error("injected close failure");
          closeSync(descriptor);
        },
      });

      expect(() => writeReceiptOnce(output, "complete\n", failedClose))
        .toThrow("close failed; output was truncated");
      expect(readFileSync(output, "utf8")).toBe("");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
