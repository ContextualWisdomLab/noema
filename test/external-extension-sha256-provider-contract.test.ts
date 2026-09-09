import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("external extension replay digest provider contract", () => {
  it("delegates SHA-256 to a platform or independently maintained immutable provider", () => {
    const source = readFileSync(
      "src/tool-capability/internal/external-extension-invocation-digest.ts",
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };

    const usesPlatformWebCrypto = source.includes("crypto.subtle.digest");
    const usesPinnedNoble =
      source.includes('from "@noble/hashes/sha2.js"') &&
      packageJson.dependencies?.["@noble/hashes"] === "2.4.0";

    expect(usesPlatformWebCrypto || usesPinnedNoble).toBe(true);
    expect(source).not.toContain("SHA256_INITIAL");
    expect(source).not.toContain("SHA256_ROUND");
    expect(source).not.toContain("function sha256Hex");
  });
});
