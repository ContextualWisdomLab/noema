import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI statement-coverage diagnostics", () => {
  it("emits exact uncovered statement ranges when the 100% statement gate fails", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("--coverage.reporter=json");
    expect(workflow).toContain("coverage/coverage-final.json");
    expect(workflow).toContain("statementMap");
    expect(workflow).toContain("Uncovered statement");
  });
});
