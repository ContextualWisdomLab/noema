import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("external JSON response retained-heap bounds", () => {
  it("keeps retained response storage independent of stream chunk cardinality", () => {
    const source = readFileSync("src/index.ts", "utf8");
    expect(source).not.toContain("const chunks: Uint8Array[] = []");
    expect(source).not.toContain("chunks.push(result.value)");
    expect(source).toContain("const bytes = new Uint8Array(maxExternalJsonResponseBytes)");
    expect(source).toContain("result.value.byteLength > maxExternalJsonResponseBytes - totalBytes");
    expect(source).toContain("bytes.set(result.value, totalBytes)");
    expect(source).toContain("return bytes.subarray(0, totalBytes)");
  });
});
