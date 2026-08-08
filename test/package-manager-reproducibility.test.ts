import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  packageManager?: string;
  devEngines?: {
    runtime?: { name?: string; version?: string; onFail?: string };
    packageManager?: { name?: string; version?: string; onFail?: string };
  };
};
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("package-manager reproducibility contract", () => {
  it("pins the reviewed Node and npm identities in repository metadata", () => {
    expect(packageJson.packageManager).toBe("npm@11.16.0");
    expect(packageJson.devEngines?.runtime).toEqual({
      name: "node",
      version: "24.18.0",
      onFail: "error",
    });
    expect(packageJson.devEngines?.packageManager).toEqual({
      name: "npm",
      version: "11.16.0",
      onFail: "error",
    });
  });

  it("pins CI to the same Node distribution and verifies toolchain identity before install", () => {
    expect(ciWorkflow).toContain('node-version: "24.18.0"');
    const toolchainGate = ciWorkflow.indexOf("name: verify package-manager toolchain");
    const install = ciWorkflow.indexOf("name: install");
    expect(toolchainGate).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(toolchainGate);
    expect(ciWorkflow).toContain('test "$(node --version)" = "v24.18.0"');
    expect(ciWorkflow).toContain('test "$(npm --version)" = "11.16.0"');
  });
});
