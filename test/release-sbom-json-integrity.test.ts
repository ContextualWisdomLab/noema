import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);

function runReleaseEvidence(temp: string, sbomText: string) {
  const sourcePath = join(temp, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(temp, "noema.cdx.json");
  const outputDir = join(temp, "release");
  writeFileSync(sourcePath, gzipSync(Buffer.from("bounded-source-archive", "utf8")));
  writeFileSync(sbomPath, sbomText, "utf8");

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
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repository,
        GITHUB_SHA: commitSha,
        GITHUB_REF: "refs/tags/v0.1.0",
        NOEMA_RELEASE_VERSION: "0.1.0",
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T00:00:00.000Z",
      },
    },
  );

  return { result, outputDir };
}

describe("release SBOM JSON integrity", () => {
  it("rejects duplicate decoded SBOM keys before last-key-wins parsing", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-sbom-integrity-"));
    try {
      const sbomText = `{
        "$schema":"http://cyclonedx.org/schema/bom-1.5.schema.json",
        "bomFormat":"SPDX",
        "bomF\\u006frmat":"CycloneDX",
        "specVersion":"1.5",
        "serialNumber":"urn:uuid:00000000-0000-4000-8000-000000000001",
        "version":1,
        "metadata":{"component":{"type":"application","name":"noema","version":"0.1.0","bom-ref":"noema@0.1.0"}},
        "components":[],
        "dependencies":[{"ref":"noema@0.1.0","dependsOn":[]}]
      }`;

      const { result, outputDir } = runReleaseEvidence(temp, sbomText);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("duplicate decoded JSON object keys");
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
