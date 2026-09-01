import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const requiredRunnerBackedWorkflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/reviewer-ci.yml",
  ".github/workflows/patch-validator-image.yml",
] as const;

describe("required workflow runner selector", () => {
  it.each(requiredRunnerBackedWorkflows)(
    "%s uses the explicit supported Ubuntu runner image",
    (workflowPath) => {
      const workflow = readFileSync(workflowPath, "utf8");

      expect(workflow).toContain("runs-on: ubuntu-24.04");
      expect(workflow).not.toContain("runs-on: ubuntu-latest");
    },
  );
});
