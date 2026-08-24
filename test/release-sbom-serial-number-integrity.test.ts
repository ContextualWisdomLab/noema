import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const commitSha = "a".repeat(40);

function runReleaseEvidence(serialNumber: string) {
  const temp = mkdtempSync(join(tmpdir(), "noema-release-sbom-serial-"));
  const sourcePath = join(temp, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(temp, "noema.cdx.json");
  const outputDir = join(temp, "release");

  writeFileSync(sourcePath, gzipSync(Buffer.from("bounded-source-archive", "utf8")));
  writeFileSync(
    sbomPath,
    JSON.stringify({
      $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      serialNumber,
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

describe("CycloneDX release SBOM serial-number integrity", () => {
  it.each([
    "urn:uuid:not-a-uuid",
    "urn:uuid:00000000000040008000000000000001",
    "urn:uuid:00000000-0000-4000-8000-00000000000g",
    "urn:uuid:00000000-0000-6000-8000-000000000001",
    "urn:uuid:00000000-0000-4000-c000-000000000001",
    "urn:uuid:00000000-0000-0000-0000-000000000000",
  ])("rejects non-authoritative RFC 4122 serial number %s", (serialNumber) => {
    const result = runReleaseEvidence(serialNumber);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SBOM serialNumber");
  });

  it("accepts a canonical non-nil CycloneDX urn:uuid form", () => {
    const result = runReleaseEvidence("urn:uuid:00000000-0000-4000-8000-000000000001");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release-evidence: PASS");
  });
});
