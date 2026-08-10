import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBoundedJson } from "../scripts/lib/patch-validator-image-receipts.mjs";

const roots: string[] = [];

/** Create one isolated directory for hostile receipt fixtures. */
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "noema-image-json-integrity-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe("patch-validator receipt JSON integrity", () => {
  it("rejects duplicate decoded object keys instead of accepting last-key-wins evidence", () => {
    const path = join(temporaryRoot(), "duplicate.json");
    writeFileSync(path, '{"status":"failed","st\\u0061tus":"passed"}');

    expect(() => readBoundedJson(path, 128)).toThrow(/valid JSON|duplicate/i);
  });

  it("rejects malformed UTF-8 instead of normalizing invalid evidence bytes", () => {
    const path = join(temporaryRoot(), "invalid-utf8.json");
    writeFileSync(
      path,
      Buffer.from([0x7b, 0x22, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
    );

    expect(() => readBoundedJson(path, 128)).toThrow(/valid JSON|UTF-8/i);
  });
});
