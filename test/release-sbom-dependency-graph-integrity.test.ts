import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const commitSha = "a".repeat(40);
const rootBomRef = "noema@0.1.0";
const componentBomRef = "dependency@1.0.0";

type Dependency = {
  ref: string;
  dependsOn?: string[];
};

function runReleaseEvidence(dependencies: Dependency[]) {
  const temp = mkdtempSync(join(tmpdir(), "noema-release-sbom-graph-"));
  const sourcePath = join(temp, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(temp, "noema.cdx.json");
  const outputDir = join(temp, "release");

  writeFileSync(sourcePath, "bounded-source-archive", "utf8");
  writeFileSync(
    sbomPath,
    JSON.stringify({
      $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
      version: 1,
      metadata: {
        component: {
          type: "application",
          name: "noema",
          version: "0.1.0",
          "bom-ref": rootBomRef,
        },
      },
      components: [{
        type: "library",
        name: "dependency",
        version: "1.0.0",
        "bom-ref": componentBomRef,
      }],
      dependencies,
    }),
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      "scripts/release-evidence.mjs",
      "--source",
      sourcePath,
      "--sbom",
      sbomPath,
      "--output-dir",
      outputDir,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        GITHUB_SHA: commitSha,
        GITHUB_REF: "refs/tags/v0.1.0",
        NOEMA_RELEASE_VERSION: "0.1.0",
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T00:00:00.000Z",
      },
      encoding: "utf8",
    },
  );

  rmSync(temp, { recursive: true, force: true });
  return result;
}

describe("CycloneDX release SBOM dependency graph identity", () => {
  it("rejects a dependency entry whose ref is not a declared bom-ref", () => {
    const result = runReleaseEvidence([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: "ghost@1.0.0", dependsOn: [] },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dependency");
  });

  it("rejects a dependsOn edge whose target is not a declared bom-ref", () => {
    const result = runReleaseEvidence([
      { ref: rootBomRef, dependsOn: ["ghost@1.0.0"] },
      { ref: componentBomRef, dependsOn: [] },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dependency");
  });

  it("rejects non-canonical dependency ref bytes", () => {
    const result = runReleaseEvidence([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: ` ${componentBomRef} `, dependsOn: [] },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dependency");
  });

  it("accepts a dependency graph whose refs resolve to canonical bom-ref identities", () => {
    const result = runReleaseEvidence([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: componentBomRef, dependsOn: [] },
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release-evidence: PASS");
  });
});
