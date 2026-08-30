import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);

function validSbom() {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: "noema",
        version: "0.1.0",
        "bom-ref": "noema@0.1.0",
      },
    },
    components: [
      {
        type: "library",
        name: "vitest",
        version: "4.1.9",
        "bom-ref": "pkg:npm/vitest@4.1.9",
      },
    ],
    dependencies: [
      { ref: "noema@0.1.0", dependsOn: ["pkg:npm/vitest@4.1.9"] },
      { ref: "pkg:npm/vitest@4.1.9", dependsOn: [] },
    ],
  };
}

function runEvidence(overrides: Record<string, string>) {
  const temp = mkdtempSync(join(tmpdir(), "noema-release-explicit-override-"));
  const sourcePath = join(temp, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(temp, "noema.cdx.json");
  const outputDir = join(temp, "release");
  writeFileSync(sourcePath, "bounded-source-archive", "utf8");
  writeFileSync(sbomPath, JSON.stringify(validSbom()), "utf8");

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
        GITHUB_REPOSITORY: repository,
        GITHUB_SHA: commitSha,
        GITHUB_REF: "refs/tags/v0.1.0",
        NOEMA_RELEASE_VERSION: "0.1.0",
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T00:00:00.000Z",
        ...overrides,
      },
      encoding: "utf8",
    },
  );

  rmSync(temp, { recursive: true, force: true });
  return result;
}

describe("explicit release identity overrides", () => {
  it.each([
    ["NOEMA_RELEASE_COMMIT_SHA", { NOEMA_RELEASE_COMMIT_SHA: "" }],
    ["NOEMA_RELEASE_REF", { NOEMA_RELEASE_REF: "" }],
    ["NOEMA_RELEASE_GENERATED_AT", { NOEMA_RELEASE_GENERATED_AT: "" }],
  ])("fails closed when %s is explicitly present but empty", (_label, overrides) => {
    const result = runEvidence(overrides);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must be a non-empty string");
  });
});
