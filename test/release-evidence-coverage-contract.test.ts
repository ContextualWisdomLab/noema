import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release evidence owned-production coverage contract", () => {
  it("keeps the executable release-evidence authority inside exact 100% coverage", () => {
    const config = readFileSync("vitest.config.ts", "utf8");

    expect(config).toContain('"scripts/release-evidence.mjs"');
    expect(config).toContain("lines: 100");
    expect(config).toContain("branches: 100");
    expect(config).toContain("functions: 100");
    expect(config).toContain("statements: 100");
  });
});
