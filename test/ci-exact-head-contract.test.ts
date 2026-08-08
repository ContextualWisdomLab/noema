import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/ci.yml";

/** Read the authoritative CI workflow as plain text for structural contract checks. */
function readCiWorkflow(): string {
  return readFileSync(workflowPath, "utf8");
}

describe("CI exact-head checkout contract", () => {
  it("checks out and verifies the immutable pull-request head before install", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain(
      "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
    );
    expect(workflow).toContain(
      "NOEMA_EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    );
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$NOEMA_EXPECTED_HEAD_SHA"');

    const checkoutIndex = workflow.indexOf("- name: checkout");
    const verifyIndex = workflow.indexOf("- name: verify exact checkout");
    const installIndex = workflow.indexOf("- name: install");

    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(verifyIndex).toBeGreaterThan(checkoutIndex);
    expect(installIndex).toBeGreaterThan(verifyIndex);
  });
});
