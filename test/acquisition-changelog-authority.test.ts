import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("acquisition changelog authority", () => {
  it("documents the immutable exact tree as tracked-byte authority", () => {
    const changelog = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8");
    const entry = changelog
      .split("\n")
      .find((line) => line.startsWith("- acquisition exact-checkout preflight가 Git cached-stat"));

    expect(entry).toBeDefined();
    expect(entry).toContain("immutable exact `HEAD` tree");
    expect(entry).toContain("stage-zero index는 index hygiene와 staged-state 검증");
  });
});
