import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("external extension replay digest provider contract", () => {
  it("uses one independently maintained immutable SHA-256 provider instead of owning the primitive", () => {
    const source = readFileSync(
      "src/tool-capability/internal/external-extension-invocation-digest.ts",
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(source).toContain('from "@noble/hashes/sha2.js"');
    expect(source).not.toContain("SHA256_INITIAL");
    expect(source).not.toContain("SHA256_ROUND");
    expect(source).not.toContain("function sha256Hex");
    expect(packageJson.dependencies?.["@noble/hashes"]).toBe("2.4.0");
  });
});
