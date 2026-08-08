import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/reviewer-ci.yml",
] as const;

/** Read one authoritative pull-request verification workflow as plain text. */
function readWorkflow(path: (typeof workflowPaths)[number]): string {
  return readFileSync(path, "utf8");
}

/** Assert that one workflow binds execution to the immutable pull-request head before running code. */
function expectExactHeadContract(workflow: string, firstExecutionStep: string): void {
  expect(workflow).toContain(
    "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
  );
  expect(workflow).toContain(
    "NOEMA_EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
  );
  expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$NOEMA_EXPECTED_HEAD_SHA"');

  const checkoutIndex = workflow.indexOf("- name: checkout");
  const verifyIndex = workflow.indexOf("- name: verify exact checkout");
  const executionIndex = workflow.indexOf(firstExecutionStep);

  expect(checkoutIndex).toBeGreaterThanOrEqual(0);
  expect(verifyIndex).toBeGreaterThan(checkoutIndex);
  expect(executionIndex).toBeGreaterThan(verifyIndex);
}

/** Assert that application CI uses the reviewed Node/npm identity and explicit tree-shaping flags. */
function expectPinnedApplicationToolchain(workflow: string): void {
  expect(workflow).toContain('node-version: "24.19.0"');
  expect(workflow).toContain('test "$(node --version)" = "v24.19.0"');
  expect(workflow).toContain('test "$(npm --version)" = "11.17.0"');
  expect(workflow).toContain("npm ci --legacy-peer-deps=false --install-links=false");

  const exactHeadGate = workflow.indexOf("- name: verify exact checkout");
  const toolchainGate = workflow.indexOf("- name: verify package-manager toolchain");
  const installIndex = workflow.indexOf("- name: install");

  expect(toolchainGate).toBeGreaterThan(exactHeadGate);
  expect(installIndex).toBeGreaterThan(toolchainGate);
}

describe("pull-request verification exact-head checkout contract", () => {
  it("binds application CI to the immutable pull-request head before install", () => {
    const workflow = readWorkflow(workflowPaths[0]);
    expectExactHeadContract(workflow, "- name: install");
    expectPinnedApplicationToolchain(workflow);
  });

  it("binds reviewer CI to the immutable pull-request head before reviewer dependency installation", () => {
    expectExactHeadContract(
      readWorkflow(workflowPaths[1]),
      "- name: install (hash-pinned dependencies)",
    );
  });
});
