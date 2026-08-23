import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRevision = "1".repeat(40);
const imageDigest = `sha256:${"2".repeat(64)}`;
const imageReference = `noema-patch-validator:${sourceRevision}`;
const undiciPurl = "pkg:npm/undici@7.13.0";
const providerDigest = `sha256:${"a".repeat(64)}`;

function writeJson(root: string, name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  return path;
}

function embeddedScannerOutput(): Record<string, unknown> {
  return {
    descriptor: {
      name: "grype",
      version: "0.116.1",
      db: {
        status: {
          schemaVersion: "v6.0.2",
          built: "2026-08-07T00:00:00Z",
          valid: true,
        },
        providers: {
          nvd: {
            captured: "2026-08-06T00:00:00Z",
            input: providerDigest,
          },
        },
      },
    },
    source: { type: "purl", target: undiciPurl },
    matches: [],
    ignoredMatches: [],
  };
}

describe("patch-validator binary Grype database provenance", () => {
  it("rejects an otherwise valid binary vulnerability receipt with no database provenance", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-binary-grype-db-"));
    try {
      const metadata = writeJson(root, "metadata.json", {
        schema_version: "noema.patch-validator-image-metadata.v1",
        source_revision: sourceRevision,
        validator_image_digest: imageDigest,
        os: "linux",
        architecture: "amd64",
        user: "65532:65532",
        entrypoint: [
          "/nodejs/bin/node",
          "--input-type=module",
          "--eval",
          "import { runCli } from '/opt/noema/runtime.mjs'; import { runEntrypoint } from '/opt/noema/entrypoint.mjs'; process.exitCode = runEntrypoint({ runCliImpl: runCli, writeDiagnostic: (message) => process.stderr.write(message) });",
        ],
        labels: {
          "org.opencontainers.image.source": "https://github.com/ContextualWisdomLab/noema",
          "org.opencontainers.image.revision": sourceRevision,
        },
      });
      const smoke = writeJson(root, "smoke.json", {
        status: "passed",
        repository_full_name: "ContextualWisdomLab/noema",
        base_sha: "0".repeat(40),
        head_sha: sourceRevision,
        patch_sha256: "3".repeat(64),
        profile: "node_patch_verify",
        command_profile: "node_patch_verify_v1",
        validator_image_digest: imageDigest,
        exit_code: 0,
        duration_ms: 10,
        stdout_excerpt: "",
        stderr_excerpt: "",
        reason_codes: [],
      });
      const sbom = writeJson(root, "sbom.json", {
        bomFormat: "CycloneDX",
        specVersion: "1.6",
        serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
        version: 1,
        metadata: {
          component: {
            type: "container",
            name: imageReference,
            properties: [
              { name: "aquasecurity:trivy:ImageID", value: imageDigest },
            ],
          },
        },
        components: [{ type: "library", name: "typescript", version: "5.9.3" }],
      });
      const vulnerabilityScan = writeJson(root, "vulnerability.json", {
        SchemaVersion: 2,
        ArtifactName: imageReference,
        ArtifactType: "container_image",
        Metadata: { ImageID: imageDigest },
        Results: [
          {
            Target: imageReference,
            Class: "os-pkgs",
            Type: "debian",
            Vulnerabilities: null,
          },
        ],
      });
      const binarySbom = writeJson(root, "binary-sbom.json", {
        descriptor: { name: "syft", version: "1.50.0" },
        source: { type: "image", metadata: { imageID: imageDigest } },
        artifacts: [
          {
            name: "node",
            version: "24.19.0",
            locations: [{ path: "/nodejs/bin/node" }],
            cpes: ["cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*"],
          },
        ],
      });
      const binaryVulnerabilityScan = writeJson(root, "binary-vulnerability.json", {
        descriptor: { name: "grype", version: "0.116.1" },
        source: { type: "image", target: { imageID: imageDigest } },
        matches: [],
        ignoredMatches: [],
      });
      const embeddedInventory = writeJson(root, "embedded-inventory.json", {
        schema_version: "noema.patch-validator-embedded-runtime-inventory.v1",
        validator_image_digest: imageDigest,
        node_version: "24.19.0",
        process_versions: { node: "24.19.0", undici: "7.13.0" },
        components: [
          {
            key: "undici",
            name: "undici",
            version: "7.13.0",
            classification: "bundled_dependency",
            purl: undiciPurl,
          },
        ],
      });
      const embeddedScan = writeJson(root, "embedded-scan.json", {
        schema_version: "noema.patch-validator-embedded-runtime-vulnerability-scan.v1",
        validator_image_digest: imageDigest,
        scanner: "grype@0.116.1",
        components: [
          {
            key: "undici",
            identity: undiciPurl,
            scanner_output: embeddedScannerOutput(),
          },
        ],
        ignoredMatches: [],
      });

      const result = spawnSync(
        process.execPath,
        [
          "scripts/verify-patch-validator-image.mjs",
          "--metadata", metadata,
          "--smoke", smoke,
          "--sbom", sbom,
          "--vulnerability-scan", vulnerabilityScan,
          "--binary-sbom", binarySbom,
          "--binary-vulnerability-scan", binaryVulnerabilityScan,
          "--embedded-runtime-inventory", embeddedInventory,
          "--embedded-vulnerability-scan", embeddedScan,
          "--expected-image-digest", imageDigest,
          "--expected-source-revision", sourceRevision,
        ],
        { cwd: repositoryRoot, encoding: "utf8" },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/binary.*database|database.*evidence/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
