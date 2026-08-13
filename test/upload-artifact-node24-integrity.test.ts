import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uploadArtifactPin =
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0 # v7.0.1";
const deprecatedUploadArtifactPin =
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02";
const supportedWorkflowPaths = [
  ".github/workflows/acquisition-readiness-scan.yml",
  ".github/workflows/cd.yml",
  ".github/workflows/central-review.yml",
  ".github/workflows/hourly-commercial-readiness.yml",
  ".github/workflows/hourly-product-development.yml",
  ".github/workflows/maintainer-app-readiness.yml",
  ".github/workflows/readiness-scan.yml",
  ".github/workflows/release-evidence.yml",
] as const;

describe("upload-artifact Node 24 supply-chain contract", () => {
  for (const workflowPath of supportedWorkflowPaths) {
    it(`${workflowPath} pins the reviewed Node 24 upload action`, () => {
      const workflow = readFileSync(workflowPath, "utf8");
      expect(workflow).toContain(uploadArtifactPin);
      expect(workflow).not.toContain(deprecatedUploadArtifactPin);
      expect(workflow).not.toMatch(/uses:\s+actions\/upload-artifact@v\d+/);
    });
  }
});
