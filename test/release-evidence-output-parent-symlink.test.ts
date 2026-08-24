import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const tempRoots: string[] = [];

function validSbom() {
  return {
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
    components: [],
    dependencies: [{ ref: "noema@0.1.0", dependsOn: [] }],
  };
}

function runReleaseEvidence(root: string, outputDir: string) {
  const sourcePath = join(root, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(root, "noema.cdx.json");
  writeFileSync(sourcePath, gzipSync(Buffer.from("bounded-source-archive", "utf8")));
  writeFileSync(sbomPath, JSON.stringify(validSbom()), "utf8");

  return spawnSync(
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
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === "win32")(
  "release evidence output parent integrity",
  () => {
    it("refuses a symlinked ancestor before creating release evidence outside the intended tree", () => {
      const root = mkdtempSync(join(tmpdir(), "noema-release-parent-link-"));
      tempRoots.push(root);
      const externalDir = join(root, "external");
      const linkedDir = join(root, "linked");
      mkdirSync(externalDir, { recursive: true });
      symlinkSync(externalDir, linkedDir, "dir");
      const outputDir = join(linkedDir, "nested-release");

      const result = runReleaseEvidence(root, outputDir);

      expect(result.status).not.toBe(0);
      expect(existsSync(join(externalDir, "nested-release", "release-evidence.json"))).toBe(false);
      expect(existsSync(join(externalDir, "nested-release", "SHA256SUMS"))).toBe(false);
    });

    it("refuses an existing real output directory reached through a symlinked ancestor", () => {
      const root = mkdtempSync(join(tmpdir(), "noema-release-existing-parent-link-"));
      tempRoots.push(root);
      const externalDir = join(root, "external");
      const externalOutputDir = join(externalDir, "release");
      const linkedDir = join(root, "linked");
      mkdirSync(externalOutputDir, { recursive: true });
      symlinkSync(externalDir, linkedDir, "dir");
      const outputDir = join(linkedDir, "release");

      const result = runReleaseEvidence(root, outputDir);

      expect(result.status).not.toBe(0);
      expect(existsSync(join(externalOutputDir, "release-evidence.json"))).toBe(false);
      expect(existsSync(join(externalOutputDir, "SHA256SUMS"))).toBe(false);
    });
  },
);
