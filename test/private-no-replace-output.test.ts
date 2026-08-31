import {
  constants,
  closeSync,
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
import { writePrivateNoReplaceFile } from "../scripts/lib/private-no-replace-output.mjs";

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

describe("private no-replace output", () => {
  it("leaves a partial failed write non-authoritative until operator cleanup", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-private-output-")));
    const output = join(directory, "provenance.json");
    try {
      const failing = fileSystem({
        writeFileSync(descriptor: number, _contents: string, options: object) {
          writeFileSync(descriptor, "partial", options);
          throw new Error("injected partial write");
        },
      });

      expect(() => writePrivateNoReplaceFile(output, "complete\n", failing))
        .toThrow("injected partial write");
      expect(readFileSync(output, "utf8")).toBe("");

      unlinkSync(output);
      writePrivateNoReplaceFile(output, "complete\n", fileSystem());
      expect(readFileSync(output, "utf8")).toBe("complete\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects replacement of the authorized parent before publication", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-private-parent-swap-")));
    const output = join(directory, "provenance.json");
    let parentReads = 0;
    try {
      const swapped = fileSystem({
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

      expect(() => writePrivateNoReplaceFile(output, "complete\n", swapped))
        .toThrow("parent authority changed during exclusive publication");
      expect(readFileSync(output, "utf8")).toBe("");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports when a failed write cannot be truncated", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-private-cleanup-fail-")));
    const output = join(directory, "provenance.json");
    try {
      const failedCleanup = fileSystem({
        writeFileSync(descriptor: number, _contents: string, options: object) {
          writeFileSync(descriptor, "partial", options);
          throw new Error("injected write failure");
        },
        ftruncateSync() {
          throw new Error("injected truncate failure");
        },
      });

      expect(() => writePrivateNoReplaceFile(output, "complete\n", failedCleanup))
        .toThrow("operator removal is required");
      expect(readFileSync(output, "utf8")).toBe("partial");
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

      expect(() => writePrivateNoReplaceFile(output, "complete\n", drifting))
        .toThrow("changed during exclusive publication");
      expect(readFileSync(output, "utf8")).toBe("");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
