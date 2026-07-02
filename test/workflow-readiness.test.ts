import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment workflow readiness gates", () => {
  it("runs production evidence preflight before strict release verification", () => {
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");
    const preflightIndex = workflow.indexOf("npm run production:preflight");
    const releaseVerifyIndex = workflow.indexOf("npm run release:verify:strict");

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(releaseVerifyIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(releaseVerifyIndex);
  });
});
