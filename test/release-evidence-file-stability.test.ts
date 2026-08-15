import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release evidence materialization file integrity", () => {
  it("consumes source and SBOM bytes through the stable descriptor reader", () => {
    const source = readFileSync("scripts/release-evidence.mjs", "utf8");

    expect(source).toContain('from "./lib/stable-file-evidence.mjs"');
    expect(source).toContain("readStableRegularFile");
    expect(source).not.toContain("readFileSync");
    expect(source).not.toContain("sha256(sourcePath)");
    expect(source).not.toContain("sha256(sbomPath)");
  });

  it("publishes both retained evidence files through the reviewed atomic writer", () => {
    const source = readFileSync("scripts/release-evidence.mjs", "utf8");

    expect(source).toContain("writeAtomically(manifestPath");
    expect(source).toContain("writeAtomically(checksumsPath");
    expect(source).not.toContain("writeFileSync");
    expect(source).not.toContain("requireSafeOutputPath");
  });
});
