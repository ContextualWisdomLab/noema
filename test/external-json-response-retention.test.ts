import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("external JSON response retained-heap bounds", () => {
  it("does not retain one response chunk object per accepted stream read", () => {
    const source = readFileSync("src/index.ts", "utf8");
    expect(source).not.toContain("const chunks: Uint8Array[] = []");
    expect(source).not.toContain("chunks.push(result.value)");
  });
});
