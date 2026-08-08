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

  it("validates the pull-request base as exactly forty lowercase hexadecimal characters", () => {
    const shaGate = ciWorkflow.indexOf('if [[ ! "$NOEMA_PR_BASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then');
    const baseRead = ciWorkflow.indexOf('git show "${NOEMA_PR_BASE_SHA}:package-lock.json"');
    expect(shaGate).toBeGreaterThan(-1);
    expect(baseRead).toBeGreaterThan(shaGate);
    expect(ciWorkflow).toContain("printf '::error::Invalid pull-request base SHA.\\n'");
    expect(ciWorkflow).toContain("exit 1");
    expect(ciWorkflow).not.toContain(
      "[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]",
    );
  });
});
