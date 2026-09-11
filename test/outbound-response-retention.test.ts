import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("credential-egress response retained-heap bounds", () => {
  it("keeps retained response storage independent of stream chunk cardinality", () => {
    const source = readFileSync("src/outbound-fetch-policy.ts", "utf8");
    expect(source).not.toContain("const chunks: Uint8Array[] = []");
    expect(source).not.toContain("chunks.push(value)");
    expect(source).toContain("const boundedBody = new Uint8Array(MAX_OUTBOUND_RESPONSE_BYTES)");
    expect(source).toContain("value.byteLength > MAX_OUTBOUND_RESPONSE_BYTES - totalBytes");
    expect(source).toContain("boundedBody.set(value, totalBytes)");
    expect(source).toContain("boundedBody.subarray(0, totalBytes)");
  });
});
