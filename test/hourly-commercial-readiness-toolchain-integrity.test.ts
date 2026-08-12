import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/hourly-commercial-readiness.yml",
  "utf8",
);

type WorkflowStep = {
  readonly name: string;
  readonly block: string;
  readonly index: number;
};

function workflowSteps(): readonly WorkflowStep[] {
  const lines = workflow.split("\n");
  const starts = lines.flatMap((line, index) => {
    const match = /^      - name: (.+)$/.exec(line);
    return match ? [{ name: match[1], index }] : [];
  });

  return starts.map(({ name, index }, position) => {
    const nextIndex = starts[position + 1]?.index ?? lines.length;
    return {
      name,
      block: lines.slice(index, nextIndex).join("\n"),
      index,
    };
  });
}

function uniqueStep(name: string): WorkflowStep {
  const matches = workflowSteps().filter((step) => step.name === name);
  expect(matches, `expected exactly one workflow step named ${name}`).toHaveLength(1);
  return matches[0];
}

describe("commercial writer toolchain integrity", () => {
  it("uses the exact protected-CI Node/npm execution contract in the intended steps", () => {
    const setup = uniqueStep("setup node");
    const verify = uniqueStep("verify package-manager toolchain");
    const install = uniqueStep("install lockfile dependencies");
    const mint = uniqueStep("mint dedicated maintainer App token");

    expect(setup.block).toContain(
      "uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(setup.block).toContain('node-version: "24.19.0"');
    expect(setup.block).not.toContain('node-version: "24"');

    expect(verify.block).toContain('test "$(node --version)" = "v24.19.0"');
    expect(verify.block).toContain('test "$(npm --version)" = "11.17.0"');

    expect(install.block).toContain(
      "run: npm ci --legacy-peer-deps=false --install-links=false",
    );
    expect(install.block).not.toMatch(/run:\s+npm ci\s*(?:\n|$)/);

    expect(setup.index).toBeLessThan(verify.index);
    expect(verify.index).toBeLessThan(install.index);
    expect(install.index).toBeLessThan(mint.index);
  });

  it("retains exact credential isolation and bounded maintainer authority", () => {
    const checkout = uniqueStep("checkout trusted default branch");
    const mint = uniqueStep("mint dedicated maintainer App token");

    expect(checkout.block).toContain("persist-credentials: false");
    expect(mint.block).toContain(
      "uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0",
    );

    const permissionLines = mint.block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("permission-"));
    expect(permissionLines).toEqual([
      "permission-actions: read",
      "permission-checks: read",
      "permission-contents: write",
      "permission-metadata: read",
      "permission-pull-requests: write",
      "permission-statuses: read",
    ]);

    const tokenConsumers = workflowSteps()
      .filter((step) =>
        step.block.includes("GH_TOKEN: ${{ steps.maintainer_app.outputs.token }}"),
      )
      .map((step) => step.name);
    expect(tokenConsumers).toEqual([
      "verify active main governance before any write",
      "inspect, dispatch, and merge exact-head pull requests",
    ]);
    expect(workflow).not.toContain("GH_TOKEN: ${{ github.token }}");
  });

  it("fails closed when no-PR commercial-readiness evidence is missing", () => {
    const upload = uniqueStep("upload no-PR commercial-readiness evidence");
    expect(upload.block).toContain("if-no-files-found: error");
    expect(upload.block).not.toContain("if-no-files-found: warn");
  });
});
