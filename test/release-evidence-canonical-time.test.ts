import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    components: [],
    dependencies: [{ ref: "noema@0.1.0", dependsOn: [] }],
  };
}

function runReleaseEvidence(generatedAt: string) {
  const directory = mkdtempSync(join(tmpdir(), "noema-release-time-"));
  const sourcePath = join(directory, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(directory, "noema.cdx.json");
  const outputDir = join(directory, "release");
  writeFileSync(sourcePath, "bounded-source-archive", "utf8");
  writeFileSync(sbomPath, JSON.stringify(validSbom()), "utf8");

  const completed = spawnSync(
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
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repository,
        GITHUB_SHA: commitSha,
        GITHUB_REF: "refs/tags/v0.1.0",
        NOEMA_RELEASE_VERSION: "0.1.0",
        NOEMA_RELEASE_GENERATED_AT: generatedAt,
      },
    },
  );

  let manifest: unknown = null;
  try {
    manifest = JSON.parse(readFileSync(join(outputDir, "release-evidence.json"), "utf8"));
  } catch {
    // Expected when the generator fails closed before publishing evidence.
  }
  rmSync(directory, { recursive: true, force: true });
  return { completed, manifest };
}

describe("release-evidence timestamp integrity", () => {
  it.each([
    ["date-only", "2026-08-03"],
    ["non-UTC offset", "2026-08-03T09:00:00.000+09:00"],
    ["missing milliseconds", "2026-08-03T00:00:00Z"],
  ])("rejects %s generatedAt values before evidence publication", (_label, generatedAt) => {
    const { completed, manifest } = runReleaseEvidence(generatedAt);

    expect(completed.status).toBe(1);
    expect(completed.stderr).toContain("canonical UTC timestamp");
    expect(completed.stdout).toBe("");
    expect(manifest).toBeNull();
  });

  it("accepts the canonical millisecond UTC representation verbatim", () => {
    const generatedAt = "2026-08-03T00:00:00.000Z";
    const { completed, manifest } = runReleaseEvidence(generatedAt);

    expect(completed.status).toBe(0);
    expect(completed.stderr).toBe("");
    expect(manifest).toMatchObject({ generatedAt });
  });
});
