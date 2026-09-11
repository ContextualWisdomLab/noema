import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("exchange request retained-heap bounds", () => {
  it("keeps retained request storage independent of stream chunk cardinality", () => {
    const source = readFileSync("src/entrypoint.ts", "utf8");
    expect(source).not.toContain("const chunks: Uint8Array[] = []");
    expect(source).not.toContain("chunks.push(value)");
    expect(source).toContain("const boundedStorage = new Uint8Array(MAX_EXCHANGE_JSON_BODY_BYTES)");
    expect(source).toContain("value.byteLength > MAX_EXCHANGE_JSON_BODY_BYTES - totalBytes");
    expect(source).toContain("boundedStorage.set(value, totalBytes)");
    expect(source).toContain("const boundedBody = boundedStorage.subarray(0, totalBytes)");
  });
});
