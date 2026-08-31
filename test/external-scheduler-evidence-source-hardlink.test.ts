import {
  linkSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readExternalSchedulerEvidence } from "../scripts/external-scheduler-evidence-audit.mjs";

describe("external scheduler retained-source inode authority", () => {
  it("rejects a retained evidence pathname that is hardlinked to another file", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-scheduler-source-hardlink-"));
    try {
      const retainedPath = join(root, "external-scheduler-evidence.json");
      const aliasPath = join(root, "buyer-evidence.json");
      writeFileSync(retainedPath, "{\"schema_version\":1}\n", "utf8");
      linkSync(retainedPath, aliasPath);

      expect(() => readExternalSchedulerEvidence(retainedPath)).toThrow(
        "External scheduler evidence must have exactly one filesystem link.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
