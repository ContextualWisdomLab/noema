import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_SOURCE_FILE_BYTES,
  applyPatchSet,
  parseUnifiedPatch,
} from "../patch-validator/runtime.mjs";

const roots = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-patch-final-coverage-"));
  roots.push(root);
  return root;
}

function addedLine(text) {
  return {
    kind: "add",
    text,
    oldNoNewline: false,
    newNoNewline: false,
  };
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe("final strict-patch coverage", () => {
  it("rejects an omitted old file header", () => {
    const patch = Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n" +
        "+++ b/src/x.ts\n" +
        "@@ -1 +1 @@\n" +
        "-x\n" +
        "+y\n",
    );
    expect(() => parseUnifiedPatch(patch)).toThrow(/incomplete file path metadata/);
  });

  it("rejects a context line that exceeds a zero old count", () => {
    const patch = Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n" +
        "--- a/src/x.ts\n" +
        "+++ b/src/x.ts\n" +
        "@@ -1,0 +1,1 @@\n" +
        " context\n",
    );
    expect(() => parseUnifiedPatch(patch)).toThrow(/more lines than declared/);
  });

  it("rejects new-file metadata on a deletion", () => {
    const patch = Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n" +
        "new file mode 100644\n" +
        "--- a/src/x.ts\n" +
        "+++ /dev/null\n" +
        "@@ -1 +0,0 @@\n" +
        "-x\n",
    );
    expect(() => parseUnifiedPatch(patch)).toThrow(/conflicting deletion metadata/);
  });

  it("modifies an authenticated empty file", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/empty.ts"), "");
    const patch = Buffer.from(
      "diff --git a/src/empty.ts b/src/empty.ts\n" +
        "--- a/src/empty.ts\n" +
        "+++ b/src/empty.ts\n" +
        "@@ -0,0 +1,1 @@\n" +
        "+filled\n",
    );
    applyPatchSet(root, parseUnifiedPatch(patch));
    expect(readFileSync(join(root, "src/empty.ts"), "utf8")).toBe("filled\n");
  });

  it("rejects a root path whose normalized target cannot satisfy confinement", () => {
    expect(() =>
      applyPatchSet("/", [
        {
          path: "src/noema-never-created.ts",
          operation: "create",
          mode: "100644",
          hunks: [
            {
              oldStart: 0,
              oldCount: 0,
              newStart: 1,
              newCount: 1,
              lines: [addedLine("never")],
            },
          ],
        },
      ]),
    ).toThrow(/escapes the private source root/);
  });

  it("creates missing private parent directories", () => {
    const root = temporaryRoot();
    applyPatchSet(root, [
      {
        path: "new/deep/file.ts",
        operation: "create",
        mode: "100644",
        hunks: [
          {
            oldStart: 0,
            oldCount: 0,
            newStart: 1,
            newCount: 1,
            lines: [addedLine("created")],
          },
        ],
      },
    ]);
    expect(readFileSync(join(root, "new/deep/file.ts"), "utf8")).toBe("created\n");
  });

  it("preserves an authenticated context line while modifying the next line", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "one\ntwo\n");
    const patch = Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n" +
        "--- a/src/example.ts\n" +
        "+++ b/src/example.ts\n" +
        "@@ -1,2 +1,2 @@\n" +
        " one\n" +
        "-two\n" +
        "+TWO\n",
    );
    applyPatchSet(root, parseUnifiedPatch(patch));
    expect(readFileSync(join(root, "src/example.ts"), "utf8")).toBe("one\nTWO\n");
  });

  it("rejects an oversized created file even when supplied through the internal contract", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    expect(() =>
      applyPatchSet(root, [
        {
          path: "src/oversized.ts",
          operation: "create",
          mode: "100644",
          hunks: [
            {
              oldStart: 0,
              oldCount: 0,
              newStart: 1,
              newCount: 1,
              lines: [addedLine("x".repeat(MAX_SOURCE_FILE_BYTES + 1))],
            },
          ],
        },
      ]),
    ).toThrow(/patched file exceeds/);
  });

  it("rejects a modification whose output crosses the source-file byte ceiling", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/full.ts"), "a".repeat(MAX_SOURCE_FILE_BYTES));
    expect(() =>
      applyPatchSet(root, [
        {
          path: "src/full.ts",
          operation: "modify",
          mode: null,
          hunks: [
            {
              oldStart: 1,
              oldCount: 0,
              newStart: 1,
              newCount: 1,
              lines: [addedLine("x")],
            },
          ],
        },
      ]),
    ).toThrow(/patched file exceeds/);
  });
});
