import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hourly commercial-readiness credential ingress", () => {
  it("requires explicit parent credential transport before building the gh child environment", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");
    const helperStart = script.indexOf("export function createGhSubprocessEnvironment");
    const helperEnd = script.indexOf("\nfunction runGh(", helperStart);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(script.slice(helperStart, helperEnd)).not.toContain("process.env");
    expect(script).not.toContain("createGhSubprocessEnvironment();");
  });
});
