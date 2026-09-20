import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const targets = [
  ["test/private-vulnerability-reporting-receipt-authority.test.ts", ["receipt", "authority", "writeReceiptFile"]],
  ["test/private-vulnerability-reporting-receipt-clock-authority.test.ts", ["writeReceipt", "authorityEnvironment"]],
  ["test/private-vulnerability-reporting-release-authority.test.ts", ["indexOfOrFail"]],
  ["test/saleable-readiness-production-docstrings.test.ts", ["immediateJsdoc"]],
] as const;

describe("PR #724 review docstring denominator", () => {
  for (const [path, names] of targets) {
    const source = readFileSync(path, "utf8");
    for (const name of names) {
      it(`keeps ${path}:${name} documented at the reviewed function boundary`, () => {
        const marker = `function ${name}(`;
        const functionIndex = source.indexOf(marker);
        expect(functionIndex, `${path}:${name} must exist`).toBeGreaterThanOrEqual(0);

        const prefix = source.slice(0, functionIndex).trimEnd();
        const commentEnd = prefix.lastIndexOf("*/");
        const commentStart = prefix.lastIndexOf("/**", commentEnd);
        expect(commentStart, `${path}:${name} must have an immediate JSDoc contract`).toBeGreaterThanOrEqual(0);
        expect(commentEnd, `${path}:${name} must have an immediate JSDoc contract`).toBeGreaterThan(commentStart);
        expect(prefix.slice(commentEnd + 2).trim(), `${path}:${name} JSDoc must be adjacent`).toBe("");
      });
    }
  }
});
