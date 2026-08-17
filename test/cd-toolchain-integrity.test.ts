import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/cd.yml", "utf8");

describe("production deployment toolchain integrity", () => {
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

  it("uses the same frozen dependency installation semantics as protected CI", () => {
    expect(workflow).toContain(
      "npm ci --legacy-peer-deps=false --install-links=false",
    );
    expect(workflow).not.toMatch(/run:\s+npm ci\s*(?:\n|$)/);
    expect(workflow).not.toContain('node-version: "24"');
  });
});
