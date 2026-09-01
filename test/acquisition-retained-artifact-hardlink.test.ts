import { linkSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStableFile } from "../scripts/lib/acquisition-data-room-integrity.mjs";

describe("acquisition retained artifact link authority", () => {
  it("rejects a retained evidence path that hardlinks another filesystem object", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-hardlink-"));
    const originalPath = join(root, "authoritative-source.json");
    const retainedPath = join(root, "retained-evidence.json");
    const bytes = "{\"source\":\"authenticated-record\"}\n";

    try {
      writeFileSync(originalPath, bytes, "utf8");
      linkSync(originalPath, retainedPath);

      expect(readStableFile(retainedPath, 1024)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
