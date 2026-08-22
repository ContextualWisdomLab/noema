import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI coverage-gate diagnostics", () => {
  it("keeps release tests fail-closed and emits bounded statement locations under exact 100% owned coverage", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const vitestConfig = readFileSync("vitest.config.ts", "utf8");

    expect(workflow).toContain("npm run test -- --reporter=dot --coverage.reporter=json --coverage.reporter=text");
    expect(workflow).toContain('log="$RUNNER_TEMP/noema-release-tests.log"');
    expect(workflow).toContain('tail -c 32768 "$log" | tail -n 160');
    expect(workflow).toContain('coverage/coverage-final.json');
    expect(workflow).toContain('statementMap');
    expect(workflow).toContain('coverage.s');
    expect(workflow).toContain('diagnosticCount >= 64');
    expect(workflow).toContain('Uncovered statement');
    expect(workflow).toContain("exit 1");

    for (const metric of ["lines", "branches", "functions", "statements"]) {
      expect(vitestConfig).toMatch(new RegExp(`${metric}:\\s*100`));
    }
  });
});
