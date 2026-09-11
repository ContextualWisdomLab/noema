import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("credential-egress response retained-heap bounds", () => {
  it("does not retain one backing chunk per accepted outbound stream read", () => {
    const source = readFileSync("src/outbound-fetch-policy.ts", "utf8");
    expect(source).not.toContain("const chunks: Uint8Array[] = []");
    expect(source).not.toContain("chunks.push(value)");
  });
});
