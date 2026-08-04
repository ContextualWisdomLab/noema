import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production coverage policy", () => {
  it("executes the production coverage gate in every release verification", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts.test).toBe("vitest run --coverage");
    expect(packageJson.scripts["release:verify"]).toContain("npm run test");
    expect(packageJson.scripts["release:verify:strict"]).toContain("npm run test");
  });

  it("covers both the Worker and the production evidence normalizer at 100 percent", () => {
    const configuration = readFileSync("vitest.config.ts", "utf8");

    expect(configuration).toContain('"src/**/*.ts"');
    expect(configuration).toContain(
      '"scripts/normalize-commercial-readiness-evidence.mjs"',
    );
    for (const metric of ["lines", "branches", "functions", "statements"]) {
      expect(configuration).toContain(`${metric}: 100`);
    }
  });
});
