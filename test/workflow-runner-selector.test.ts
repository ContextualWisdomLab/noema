import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const requiredRunnerBackedWorkflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/reviewer-ci.yml",
  ".github/workflows/patch-validator-image.yml",
] as const;

const runsOnSelector = /^\s*runs-on:\s*(["']?)([^\s"']+)\1\s*$/m;

describe("required workflow runner selector", () => {
  it.each(requiredRunnerBackedWorkflows)(
    "%s uses the explicit supported Ubuntu runner image",
    (workflowPath) => {
      const workflow = readFileSync(workflowPath, "utf8");
      const match = workflow.match(runsOnSelector);

      expect(match?.[2]).toBe("ubuntu-24.04");
      expect(match?.[2]).not.toBe("ubuntu-latest");
    },
  );

  it.each([
    "runs-on: ubuntu-latest",
    'runs-on: "ubuntu-latest"',
    "runs-on: 'ubuntu-latest'",
  ])("rejects floating runner selector syntax: %s", (workflowLine) => {
    expect(workflowLine.match(runsOnSelector)?.[2]).toBe("ubuntu-latest");
  });
});
