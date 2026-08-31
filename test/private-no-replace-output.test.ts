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
import { writePrivateNoReplaceFile } from "../scripts/lib/private-no-replace-output.mjs";

function fileSystem(overrides: Record<string, unknown> = {}) {
  return { constants, linkSync, lstatSync, unlinkSync, writeFileSync, ...overrides };
}

describe("private no-replace output", () => {
  it("cleans a partial staging write and permits a clean retry", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-private-output-")));
    const output = join(directory, "provenance.json");
    try {
      const failing = fileSystem({
        writeFileSync(path: string, _contents: string, options: object) {
          writeFileSync(path, "partial", options);
          throw new Error("injected partial write");
        },
      });

      expect(() => writePrivateNoReplaceFile(output, "complete\n", failing, () => "first"))
        .toThrow("injected partial write");
      expect(existsSync(output)).toBe(false);
      expect(existsSync(`${output}.tmp-${process.pid}-first`)).toBe(false);

      writePrivateNoReplaceFile(output, "complete\n", fileSystem(), () => "retry");
      expect(readFileSync(output, "utf8")).toBe("complete\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never replaces an existing target", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-private-output-")));
    const output = join(directory, "provenance.json");
    try {
      writeFileSync(output, "preserve\n", { mode: 0o600 });

      expect(() => writePrivateNoReplaceFile(output, "replacement\n"))
        .toThrow("must not already exist");
      expect(readFileSync(output, "utf8")).toBe("preserve\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails post-publication identity drift without deleting the published inode", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-private-output-")));
    const output = join(directory, "provenance.json");
    let targetReads = 0;
    try {
      const drifting = fileSystem({
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

      expect(() => writePrivateNoReplaceFile(output, "complete\n", drifting, () => "drift"))
        .toThrow("changed after no-replace publication");
      expect(readFileSync(output, "utf8")).toBe("complete\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
