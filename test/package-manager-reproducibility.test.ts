import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  packageManager?: string;
  allowScripts?: Record<string, boolean>;
  devEngines?: {
    runtime?: { name?: string; version?: string; onFail?: string };
    packageManager?: { name?: string; version?: string; onFail?: string };
  };
};
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const npmConfig = readFileSync(".npmrc", "utf8");

describe("package-manager reproducibility contract", () => {
  it("pins the reviewed Node and npm identities in repository metadata", () => {
    expect(packageJson.packageManager).toBe("npm@11.17.0");
    expect(packageJson.devEngines?.runtime).toEqual({
      name: "node",
      version: "24.19.0",
      onFail: "error",
    });
    expect(packageJson.devEngines?.packageManager).toEqual({
      name: "npm",
      version: "11.17.0",
      onFail: "error",
    });
  });

  it("fails closed on unreviewed dependency install scripts and pins reviewed script identities", () => {
    expect(npmConfig.split(/\r?\n/).filter(Boolean)).toContain("strict-allow-scripts=true");
    expect(packageJson.allowScripts).toEqual({
      "esbuild@0.28.1": true,
      "fsevents@2.3.3": false,
      "workerd@1.20260625.1": true,
    });
  });

  it("pins CI to Node-24-native checkout and setup-node action releases", () => {
    expect(ciWorkflow).toContain(
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
    );
    expect(ciWorkflow).toContain(
      "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(ciWorkflow).not.toContain("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683");
    expect(ciWorkflow).not.toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
  });

  it("pins CI to the same Node distribution and verifies toolchain identity before install", () => {
    expect(ciWorkflow).toContain('node-version: "24.19.0"');
    const toolchainGate = ciWorkflow.indexOf("name: verify package-manager toolchain");
    const install = ciWorkflow.indexOf("name: install");
    expect(toolchainGate).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(toolchainGate);
    expect(ciWorkflow).toContain('test "$(node --version)" = "v24.19.0"');
    expect(ciWorkflow).toContain('test "$(npm --version)" = "11.17.0"');
  });

  it("checks out and verifies the exact pull-request head instead of GitHub's synthetic merge ref", () => {
    const checkout = ciWorkflow.indexOf("name: checkout");
    const setupNode = ciWorkflow.indexOf("name: setup node");
    expect(checkout).toBeGreaterThan(-1);
    expect(setupNode).toBeGreaterThan(checkout);
    expect(ciWorkflow).toContain(
      "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
    );
    expect(ciWorkflow).toContain("name: verify exact checkout");
    expect(ciWorkflow).toContain("NOEMA_EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(ciWorkflow).toContain('test "$(git rev-parse HEAD)" = "$NOEMA_EXPECTED_HEAD_SHA"');
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
