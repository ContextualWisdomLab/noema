import { describe, expect, it } from "vitest";
import { validateRepositoryRelativePath } from "../.github/codegraph/sandbox-node-runner.mjs";


describe("CodeGraph sandbox symbol-probe path boundary", () => {
  it("preserves exact repository-relative Git path identity", () => {
    const paths = [
      "src/readiness.ts",
      "src/leading space.ts",
      "src/repeated  spaces.ts",
      "src/line\nbreak.ts",
      "src/tab\tbreak.ts",
    ];

    for (const path of paths) {
      expect(validateRepositoryRelativePath(path)).toBe(path);
    }
  });

  it("rejects traversal, absolute, empty, NUL, and oversized paths", () => {
    for (const path of ["", "/etc/passwd", "../secret", "src/../secret", "src//x", "bad\0path"]) {
      expect(() => validateRepositoryRelativePath(path)).toThrow();
    }
    expect(() => validateRepositoryRelativePath("x".repeat(24_080))).toThrow(
      "bounded input contract",
    );
  });
});
