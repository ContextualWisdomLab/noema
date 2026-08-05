import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourcePath = "scripts/prepare-agent-pr-message.mjs";

function functionNames(source: string): string[] {
  return Array.from(
    source.matchAll(/^(?:export )?function ([A-Za-z_$][\w$]*)\s*\(/gmu),
    (match) => match[1],
  );
}

function hasLeadingJsDoc(source: string, functionName: string): boolean {
  const declaration = new RegExp(
    `^(?:export )?function ${functionName.replace(/[$]/gu, "\\$")}\\s*\\(`,
    "mu",
  ).exec(source);
  if (declaration?.index === undefined) return false;

  const prefix = source.slice(0, declaration.index).trimEnd();
  if (!prefix.endsWith("*/")) return false;
  const commentStart = prefix.lastIndexOf("/**");
  const previousCommentEnd = prefix.lastIndexOf("*/", prefix.length - 3);
  return commentStart > previousCommentEnd;
}

describe("agent PR metadata production-quality policy", () => {
  it("includes the production parser in the enforced 100 percent coverage set", () => {
    const configuration = readFileSync("vitest.config.ts", "utf8");

    expect(configuration).toContain(`"${sourcePath}"`);
  });

  it("documents every production function with a JSDoc contract", () => {
    const source = readFileSync(sourcePath, "utf8");
    const names = functionNames(source);

    expect(names).not.toHaveLength(0);
    expect(names.filter((name) => !hasLeadingJsDoc(source, name))).toEqual([]);
  });
});
