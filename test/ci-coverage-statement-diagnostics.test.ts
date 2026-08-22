import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI coverage-gate diagnostics", () => {
  it("keeps release tests fail-closed with bounded diagnostics under exact 100% owned coverage", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const vitestConfig = readFileSync("vitest.config.ts", "utf8");

    expect(workflow).toContain("npm run test -- --reporter=dot");
    expect(workflow).toContain('log="$RUNNER_TEMP/noema-release-tests.log"');
    expect(workflow).toContain('tail -c 32768 "$log" | tail -n 160');
    expect(workflow).toContain("exit 1");

    for (const metric of ["lines", "branches", "functions", "statements"]) {
      expect(vitestConfig).toMatch(new RegExp(`${metric}:\\s*100`));
    }
  });
});
