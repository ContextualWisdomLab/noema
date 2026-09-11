import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOW_PATHS = [
  ".github/workflows/reviewer-ci.yml",
  ".github/workflows/central-review.yml",
  ".github/workflows/patch-validator-image.yml",
] as const;
const POLICY_PATH = "docs/doctoring/trivy-severity-source-policy.md";

describe("Trivy vulnerability severity-source policy", () => {
  it.each(WORKFLOW_PATHS)(
    "%s retains Trivy auto severity selection rather than narrowing vendor data",
    (workflowPath) => {
      const workflow = readFileSync(workflowPath, "utf8");
      expect(workflow).not.toContain("--vuln-severity-source");
    },
  );

  it("documents why the vendor-severity diagnostic remains visible", () => {
    const policy = readFileSync(POLICY_PATH, "utf8");

    expect(policy).toContain("`auto`");
    expect(policy).toContain("OS vendor");
    expect(policy).toContain("backport");
    expect(policy).toContain("SeveritySource");
    expect(policy).toContain("diagnostic remains visible");
    expect(policy).toContain("must not be suppressed");
  });
});
