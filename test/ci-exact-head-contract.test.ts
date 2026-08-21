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

  it("binds lockfile verification to one fresh live base instead of the historical PR base snapshot", () => {
    const workflow = readWorkflow(workflowPaths[0]);

    expect(workflow).toContain(
      'git merge-base --is-ancestor "$live_base_sha" "$NOEMA_EXPECTED_HEAD_SHA"',
    );
    expect(workflow).toContain(
      'printf \'NOEMA_LIVE_BASE_SHA=%s\\n\' "$live_base_sha" >> "$GITHUB_ENV"',
    );
    expect(workflow).toContain(
      'git show "${NOEMA_LIVE_BASE_SHA}:package-lock.json" >"$base_lock"',
    );
    expect(workflow).toContain('NOEMA_LOCKFILE_BASE_SHA="$NOEMA_LIVE_BASE_SHA"');
    expect(workflow).toContain('if [ "$live_base_sha" != "$NOEMA_LIVE_BASE_SHA" ]; then');
    expect(workflow).not.toContain(
      'NOEMA_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}',
    );
    expect(workflow).not.toContain('test "$live_base_sha" = "$NOEMA_PR_BASE_SHA"');
  });

  it("keeps each release verifier visible as its own failing CI boundary with bounded test diagnostics", () => {
    const workflow = readWorkflow(workflowPaths[0]);
    const releaseSteps = [
      ["- name: release typecheck", "run: npm run typecheck"],
      ["- name: release tests", "run: npm run test -- --reporter=dot"],
      ["- name: release security scan", "run: npm run security:scan"],
      ["- name: release KPI verification", "run: npm run kpi:verify"],
      ["- name: release acquisition manifest", "run: npm run acquisition:manifest"],
      ["- name: release acquisition integrity", "run: npm run acquisition:integrity"],
    ] as const;

    let previousIndex = workflow.indexOf("- name: install");
    expect(previousIndex).toBeGreaterThanOrEqual(0);
    for (const [stepName, command] of releaseSteps) {
      const stepIndex = workflow.indexOf(stepName);
      expect(stepIndex).toBeGreaterThan(previousIndex);
      expect(workflow.slice(stepIndex)).toContain(command);
      previousIndex = stepIndex;
    }
    expect(workflow).not.toContain("run: npm run release:verify");
  });

  it("binds reviewer CI to the immutable pull-request head before reviewer dependency installation", () => {
    expectExactHeadContract(
      readWorkflow(workflowPaths[1]),
      "- name: install (hash-pinned dependencies)",
    );
  });
});
