import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uploadArtifactPin =
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1";
const deprecatedUploadArtifactPin =
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02";
const workflowDirectory = ".github/workflows";
const supportedWorkflowPaths = [
  ".github/workflows/acquisition-readiness-scan.yml",
  ".github/workflows/cd.yml",
  ".github/workflows/central-review.yml",
  ".github/workflows/hourly-commercial-readiness.yml",
  ".github/workflows/hourly-product-development.yml",
  ".github/workflows/maintainer-app-readiness.yml",
  ".github/workflows/patch-validator-image.yml",
  ".github/workflows/readiness-scan.yml",
  ".github/workflows/release-evidence.yml",
] as const;

function workflowPathsUsingUploadArtifact(): string[] {
  return readdirSync(workflowDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
    )
    .map((entry) => `${workflowDirectory}/${entry.name}`)
    .filter((workflowPath) =>
      readFileSync(workflowPath, "utf8").includes("actions/upload-artifact@"),
    )
    .sort();
}

describe("upload-artifact Node 24 supply-chain contract", () => {
  it("keeps the reviewed workflow inventory complete", () => {
    expect(workflowPathsUsingUploadArtifact()).toEqual([...supportedWorkflowPaths].sort());
  });

  for (const workflowPath of supportedWorkflowPaths) {
    it(`${workflowPath} pins every upload-artifact use to the reviewed Node 24 action`, () => {
      const workflow = readFileSync(workflowPath, "utf8");
      const uploadArtifactLines = workflow
        .split(/\r?\n/)
        .filter((line) => line.includes("actions/upload-artifact@"))
        .map((line) => line.trim());

      expect(uploadArtifactLines.length).toBeGreaterThan(0);
      expect(uploadArtifactLines).toEqual(
        uploadArtifactLines.map(() => `uses: ${uploadArtifactPin}`),
      );
      expect(workflow).not.toContain(deprecatedUploadArtifactPin);
      expect(workflow).not.toMatch(/uses:\s+actions\/upload-artifact@v\d+/);
    });
  }
});
