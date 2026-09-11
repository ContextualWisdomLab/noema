import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWER_WORKFLOW = ".github/workflows/reviewer-ci.yml";
const SETUP_TRIVY_PIN =
  "aquasecurity/setup-trivy@81e514348e19b6112ce2a7e3ecbafe19c1e1f567";

describe("reviewer-ci Trivy toolchain currency", () => {
  it("uses the reviewed current scanner without weakening the setup action pin", () => {
    const workflow = readFileSync(REVIEWER_WORKFLOW, "utf8");
    expect(workflow).toContain(SETUP_TRIVY_PIN);
    expect(workflow).toContain("version: v0.74.0");
    expect(workflow).not.toContain("version: v0.73.0");
    expect(workflow).toContain("--exit-code 1");
    expect(workflow).toContain("--severity MEDIUM,HIGH,CRITICAL");
    expect(workflow).toContain("--scanners vuln");
  });
});
