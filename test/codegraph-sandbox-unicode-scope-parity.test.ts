import { describe, expect, it } from "vitest";
import { normalizeChangedPaths } from "../.github/codegraph/sandbox-runner.mjs";

function astralGitPath(): string {
  const component = "😀".repeat(50);
  return `${component}/${component}/${component}/${component}/${component}/${component}.ts`;
}

describe("CodeGraph changed-scope character-budget parity", () => {
  it("counts Unicode code points like the Python reviewer instead of UTF-16 code units", () => {
    const paths = Array.from({ length: 40 }, astralGitPath);

    // Python len(" ".join(paths)) is 12,359 code points, below the canonical
    // 24,079-character reviewer budget. JavaScript String.length counts each
    // astral code point as two UTF-16 code units and would incorrectly reject
    // the same Git path inventory if the sandbox used String.length directly.
    expect(Array.from(paths.join(" ")).length).toBe(12_359);
    expect(paths.join(" ").length).toBe(24_359);
    expect(normalizeChangedPaths(paths)).toEqual(paths);
  });
});
