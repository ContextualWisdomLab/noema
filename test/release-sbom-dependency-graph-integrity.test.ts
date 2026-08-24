import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const commitSha = "a".repeat(40);
const rootBomRef = "noema@0.1.0";
const componentBomRef = "dependency@1.0.0";
const nestedComponentBomRef = "nested-dependency@2.0.0";

const defaultComponents = [{
  type: "library",
  name: "dependency",
  version: "1.0.0",
  "bom-ref": componentBomRef,
}];

function runReleaseEvidence(dependencies: unknown[], components: unknown[] = defaultComponents) {
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
      components,
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

function expectRejected(dependencies: unknown[], components?: unknown[]) {
  const result = runReleaseEvidence(dependencies, components);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("dependency");
}

describe("CycloneDX release SBOM dependency graph identity", () => {
  it("rejects a dependency entry whose ref is not a declared bom-ref", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: "ghost@1.0.0", dependsOn: [] },
    ]);
  });

  it("does not echo undeclared bom-ref authority into failure output", () => {
    const sensitiveBomRef = ["ghp", "_", "A".repeat(36)].join("");
    const result = runReleaseEvidence([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: sensitiveBomRef, dependsOn: [] },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must reference a declared bom-ref identity");
    expect(result.stderr).not.toContain(sensitiveBomRef);
  });

  it("rejects a dependsOn edge whose target is not a declared bom-ref", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: ["ghost@1.0.0"] },
      { ref: componentBomRef, dependsOn: [] },
    ]);
  });

  it("rejects non-canonical dependency ref bytes", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: ` ${componentBomRef} `, dependsOn: [] },
    ]);
  });

  it("rejects non-canonical dependsOn target bytes", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: [` ${componentBomRef} `] },
      { ref: componentBomRef, dependsOn: [] },
    ]);
  });

  it("rejects non-object dependency entries", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      null,
    ]);
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      "dependency@1.0.0",
    ]);
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      [],
    ]);
  });

  it("rejects malformed and duplicate dependency authorities", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: componentBomRef, dependsOn: componentBomRef },
    ]);
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: componentBomRef, dependsOn: [] },
      { ref: componentBomRef, dependsOn: [] },
    ]);
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef, componentBomRef] },
      { ref: componentBomRef, dependsOn: [] },
    ]);
  });

  it("rejects non-string dependency references", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: 42, dependsOn: [] },
    ]);
    expectRejected([
      { ref: rootBomRef, dependsOn: [42] },
      { ref: componentBomRef, dependsOn: [] },
    ]);
  });

  it("rejects a listed component omitted from the dependency graph", () => {
    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
    ]);
  });

  it("rejects a nested component omitted from the dependency graph", () => {
    const nestedComponents = [{
      ...defaultComponents[0],
      components: [{
        type: "library",
        name: "nested-dependency",
        version: "2.0.0",
        "bom-ref": nestedComponentBomRef,
      }],
    }];

    expectRejected([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: componentBomRef, dependsOn: [] },
    ], nestedComponents);
  });

  it("accepts nested component assemblies when each component has an explicit graph node", () => {
    const nestedComponents = [{
      ...defaultComponents[0],
      components: [{
        type: "library",
        name: "nested-dependency",
        version: "2.0.0",
        "bom-ref": nestedComponentBomRef,
      }],
    }];
    const result = runReleaseEvidence([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: componentBomRef, dependsOn: [] },
      { ref: nestedComponentBomRef, dependsOn: [] },
    ], nestedComponents);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release-evidence: PASS");
  });

  it("accepts dependency entries that omit optional dependsOn", () => {
    const result = runReleaseEvidence([
      { ref: rootBomRef, dependsOn: [componentBomRef] },
      { ref: componentBomRef },
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release-evidence: PASS");
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