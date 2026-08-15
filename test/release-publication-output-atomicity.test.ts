import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release publication receipt output", () => {
  it("publishes through an unpredictable temporary file plus atomic rename", () => {
    const source = readFileSync("scripts/release-publication-receipt.mjs", "utf8");

    expect(source).toContain("function writeAtomically");
    expect(source).toContain("mkdtempSync");
    expect(source).toContain('flag: "wx"');
    expect(source).toContain("renameSync(temporaryPath, path)");
    expect(source).toContain("writeAtomically(args.outputPath");
    expect(source).not.toContain("writeFileSync(args.outputPath");
    expect(source).not.toContain("existsSync(args.outputPath)");
    expect(source).not.toContain("lstatSync(args.outputPath)");
  });
});
