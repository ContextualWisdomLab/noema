import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release publication receipt output", () => {
  it("uses the reviewed atomic evidence writer instead of a pathname check followed by direct write", () => {
    const source = readFileSync("scripts/release-publication-receipt.mjs", "utf8");

    expect(source).toContain("writeAtomically");
    expect(source).not.toContain("writeFileSync");
    expect(source).not.toContain("existsSync(args.outputPath)");
    expect(source).not.toContain("lstatSync(args.outputPath)");
  });
});
