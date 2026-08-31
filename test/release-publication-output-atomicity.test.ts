import {
  constants,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
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
  return { constants, linkSync, lstatSync, unlinkSync, writeFileSync, ...overrides };
}

describe("release publication receipt output", () => {
  it("publishes a complete staged receipt with atomic no-replace linkage", () => {
    const source = readFileSync("scripts/release-publication-receipt.mjs", "utf8");

    expect(source).toContain("function writeReceiptOnce");
    expect(source).toContain('flag: "wx"');
    expect(source).toContain("linkSync(temporaryPath, path)");
    expect(source).toContain("writeReceiptOnce(args.outputPath");
    expect(source).not.toContain("writeFileSync(args.outputPath");
    expect(source).not.toContain("existsSync(args.outputPath)");
    expect(source).not.toContain("renameSync(");
  });

  it("cleans a partial staging write so publication can be retried", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-release-partial-")));
    const output = join(directory, "receipt.json");
    try {
      const failedWrite = fileSystem({
        writeFileSync(path: string, _content: string, options: object) {
          writeFileSync(path, "partial", options);
          throw new Error("injected write failure");
        },
      });

      expect(() => writeReceiptOnce(output, "complete\n", failedWrite, () => "fixed"))
        .toThrow("injected write failure");
      expect(existsSync(output)).toBe(false);
      expect(existsSync(`${output}.tmp-${process.pid}-fixed`)).toBe(false);

      writeReceiptOnce(output, "complete\n", fileSystem(), () => "retry");
      expect(readFileSync(output, "utf8")).toBe("complete\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("removes its identity-bound target when final validation fails", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-release-postcheck-")));
    const output = join(directory, "receipt.json");
    let targetReads = 0;
    try {
      const postCheckFailure = fileSystem({
        lstatSync(path: string, options?: object) {
          const metadata = lstatSync(path, options);
          if (path === output && metadata && ++targetReads === 2) {
            return Object.assign(
              Object.create(Object.getPrototypeOf(metadata)),
              metadata,
              { size: metadata.size + 1 },
            );
          }
          return metadata;
        },
      });

      expect(() => writeReceiptOnce(output, "complete\n", postCheckFailure, () => "fixed"))
        .toThrow("changed after no-replace publication");
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
