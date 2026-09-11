import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const trivyWorkflows = [
  ".github/workflows/reviewer-ci.yml",
  ".github/workflows/central-review.yml",
  ".github/workflows/patch-validator-image.yml",
] as const;

const SETUP_TRIVY_PIN =
  "aquasecurity/setup-trivy@81e514348e19b6112ce2a7e3ecbafe19c1e1f567";

describe("Trivy toolchain currency", () => {
  it("uses the current reviewed scanner version across every Noema image-scan lane", () => {
    for (const path of trivyWorkflows) {
      const workflow = readFileSync(path, "utf8");
      expect(workflow).toContain(SETUP_TRIVY_PIN);
      expect(workflow).toContain("version: v0.74.0");
      expect(workflow).not.toContain("version: v0.73.0");
    }
  });
});
