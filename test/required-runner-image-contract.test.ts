import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native CI GitHub-hosted runner image", () => {
  it("pins the exact-head verification lane to the supported ubuntu-24.04 image", () => {
    const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

    expect(source).not.toMatch(/^\s*runs-on:\s*ubuntu-latest\s*$/mu);
    expect(source).toMatch(/^\s*runs-on:\s*ubuntu-24\.04\s*$/mu);
  });
});
