import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWER_WORKFLOW = ".github/workflows/reviewer-ci.yml";
const CENTRAL_REVIEW_WORKFLOW = ".github/workflows/central-review.yml";
const PATCH_VALIDATOR_WORKFLOW = ".github/workflows/patch-validator-image.yml";
const CODEGRAPH_SANDBOX_PREPARER = "scripts/prepare-codegraph-sandbox.sh";
const SETUP_TRIVY_PIN =
  "aquasecurity/setup-trivy@81e514348e19b6112ce2a7e3ecbafe19c1e1f567";

const REVIEWED_TRIVY_WORKFLOWS = [
  ["reviewer-ci", REVIEWER_WORKFLOW],
  ["central-review", CENTRAL_REVIEW_WORKFLOW],
  ["patch-validator-image", PATCH_VALIDATOR_WORKFLOW],
] as const;

describe("Trivy toolchain currency", () => {
  it.each(REVIEWED_TRIVY_WORKFLOWS)(
    "%s uses the reviewed current scanner without weakening the setup action pin",
    (_name, workflowPath) => {
      const workflow = readFileSync(workflowPath, "utf8");
      expect(workflow).toContain(SETUP_TRIVY_PIN);
      expect(workflow).toContain("version: v0.74.0");
      expect(workflow).not.toContain("version: v0.73.0");
    },
  );

  it("keeps reviewer-ci fail-closed vulnerability admission in the shared sandbox preparer", () => {
    const workflow = readFileSync(REVIEWER_WORKFLOW, "utf8");
    const preparer = readFileSync(CODEGRAPH_SANDBOX_PREPARER, "utf8");
    expect(workflow).toContain("bash ../scripts/prepare-codegraph-sandbox.sh");
    expect(preparer).toContain("--exit-code 1");
    expect(preparer).toContain("--severity MEDIUM,HIGH,CRITICAL");
    expect(preparer).toContain("--scanners vuln");
  });
});
