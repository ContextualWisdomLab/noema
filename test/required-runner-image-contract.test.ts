import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredLocalWorkflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/reviewer-ci.yml",
  ".github/workflows/patch-validator-image.yml",
] as const;

describe("required local GitHub-hosted runner image", () => {
  it.each(requiredLocalWorkflows)("pins %s to the supported ubuntu-24.04 image", (workflowPath) => {
    const source = readFileSync(new URL(`../${workflowPath}`, import.meta.url), "utf8");

    expect(source).not.toMatch(/^\s*runs-on:\s*ubuntu-latest\s*$/mu);
    expect(source).toMatch(/^\s*runs-on:\s*ubuntu-24\.04\s*$/mu);
  });
});
