import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";

it("counts recursively nested CycloneDX components in retained release evidence", () => {
  const temp = mkdtempSync(join(tmpdir(), "noema-release-nested-count-"));
  const commitSha = "a".repeat(40);
  const sourcePath = join(temp, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(temp, "noema.cdx.json");
  const outputDir = join(temp, "release");

  try {
    writeFileSync(sourcePath, gzipSync("bounded-source-archive"));
    writeFileSync(sbomPath, JSON.stringify({
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
          "bom-ref": "noema@0.1.0",
        },
      },
      components: [{
        type: "library",
        name: "parent",
        version: "1.0.0",
        "bom-ref": "parent@1.0.0",
        components: [{
          type: "library",
          name: "nested",
          version: "2.0.0",
          "bom-ref": "nested@2.0.0",
        }],
      }],
      dependencies: [
        { ref: "noema@0.1.0", dependsOn: ["parent@1.0.0"] },
        { ref: "parent@1.0.0", dependsOn: [] },
        { ref: "nested@2.0.0", dependsOn: [] },
      ],
    }), "utf8");

    const result = spawnSync(process.execPath, [
      "scripts/release-evidence.mjs",
      "--source",
      sourcePath,
      "--sbom",
      sbomPath,
      "--output-dir",
      outputDir,
    ], {
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
    });

    expect(result.status).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(outputDir, "release-evidence.json"), "utf8"),
    );
    expect(manifest.sbom.componentCount).toBe(2);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
