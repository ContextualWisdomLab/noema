import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");

describe("release evidence toolchain integrity", () => {
  it("uses the exact protected-CI Node and npm identities before installation", () => {
    expect(workflow).toContain(
      "uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(workflow).toContain('node-version: "24.19.0"');
    expect(workflow).toContain('test "$(node --version)" = "v24.19.0"');
    expect(workflow).toContain('test "$(npm --version)" = "11.17.0"');

    const toolchainIndex = workflow.indexOf('test "$(npm --version)" = "11.17.0"');
    const installIndex = workflow.indexOf(
      "npm ci --legacy-peer-deps=false --install-links=false",
    );
    expect(toolchainIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(-1);
    expect(toolchainIndex).toBeLessThan(installIndex);
  });

  it("uses frozen install semantics before release verification and evidence generation", () => {
    const install = "npm ci --legacy-peer-deps=false --install-links=false";
    const installIndex = workflow.indexOf(install);
    const verifyIndex = workflow.indexOf("npm run release:verify");
    const sbomIndex = workflow.indexOf("npm sbom --package-lock-only");

    expect(installIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(installIndex);
    expect(sbomIndex).toBeGreaterThan(installIndex);
    expect(workflow).not.toMatch(/run:\s+npm ci\s*(?:\n|$)/);
    expect(workflow).not.toContain('node-version: "24"');
  });
});
