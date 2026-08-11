import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/maintainer-app-readiness.yml",
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

describe("maintainer App readiness runtime integrity", () => {
  it("uses the exact protected-CI Node runtime in the intended steps before repository scripts execute", () => {
    const setup = uniqueStep("setup Node.js");
    const verify = uniqueStep("verify Node.js runtime");
    const governance = uniqueStep("audit active main governance");
    const readiness = uniqueStep("audit effective Maintainer App identity and access");
    const normalize = uniqueStep("normalize bounded commercial-loop evidence");

    expect(setup.block).toContain(
      "uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(setup.block).toContain('node-version: "24.19.0"');
    expect(setup.block).not.toContain('node-version: "24"');
    expect(verify.block).toContain('test "$(node --version)" = "v24.19.0"');

    expect(setup.index).toBeLessThan(verify.index);
    expect(verify.index).toBeLessThan(governance.index);
    expect(verify.index).toBeLessThan(readiness.index);
    expect(verify.index).toBeLessThan(normalize.index);

    expect(governance.block).toContain("node scripts/main-governance-audit.mjs");
    expect(readiness.block).toContain("node scripts/maintainer-app-readiness.mjs");
    expect(normalize.block).toContain(
      "node scripts/normalize-commercial-readiness-evidence.mjs",
    );
  });

  it("does not add dependency installation to the credentialed preflight", () => {
    expect(workflow).not.toContain("npm ci");
    expect(workflow).not.toContain("npm install");
    expect(workflow).not.toContain("npm run");
  });
});
