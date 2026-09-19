import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/saleable-readiness-audit.mjs", "utf8");

const productionFunctions = [
  "createReadinessSubprocessEnvironment",
  "runCommand",
  "record",
  "isDeferredCheck",
  "isReportOnlyMode",
  "isReportOnlyEvidenceGap",
  "logBlockingFailures",
] as const;

function immediateJsdoc(name: string): string | undefined {
  const marker = `function ${name}(`;
  const functionIndex = source.indexOf(marker);
  if (functionIndex < 0) return undefined;

  const prefix = source.slice(0, functionIndex).trimEnd();
  const commentEnd = prefix.lastIndexOf("*/");
  const commentStart = prefix.lastIndexOf("/**", commentEnd);
  if (commentStart < 0 || commentEnd < commentStart) return undefined;
  if (prefix.slice(commentEnd + 2).trim().length > 0) return undefined;
  return prefix.slice(commentStart, commentEnd + 2);
}

describe("saleable-readiness production docstring contract", () => {
  for (const name of productionFunctions) {
    it(`documents ${name} at the production boundary`, () => {
      const doc = immediateJsdoc(name);
      expect(doc, `${name} must have an immediate JSDoc contract`).toBeDefined();
      expect(doc).toContain("/**");
    });
  }
});
