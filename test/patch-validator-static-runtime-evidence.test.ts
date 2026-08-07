import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"2".repeat(64)}`;
const providerDigest = `sha256:${"a".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const opensslCpe = "cpe:2.3:a:openssl:openssl:3.5.2:*:*:*:*:*:*:*";
const undiciPurl = "pkg:npm/undici@7.13.0";

function rawScannerOutput(
  identity: string,
  matches: any[] = [],
  ignoredMatches: any[] | null = [],
): any {
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
    source: {
      type: identity.startsWith("pkg:") ? "purl" : "cpe",
      target: identity,
    },
    matches,
    ignoredMatches,
  };
}

function cleanComponentScan(key: string, identity: string): any {
  return {
    key,
    identity,
    scanner_output: rawScannerOutput(identity),
  };
}

function validInput(): any {
  return {
    expectedImageDigest: imageDigest,
    binarySbom: {
      descriptor: { name: "syft", version: "1.50.0" },
      source: {
        type: "image",
        metadata: { imageID: imageDigest },
      },
      artifacts: [
        {
          name: "node",
          version: "24.19.0",
          locations: [{ path: "/nodejs/bin/node" }],
          cpes: [{ cpe: nodeCpe, source: "syft-generated" }],
        },
        {
          name: "typescript",
          version: "5.9.3",
          locations: [{ accessPath: "/opt/noema/node_modules/typescript/package.json" }],
          cpes: [],
        },
      ],
    },
    binaryVulnerabilityScan: {
      matches: [
        {
          vulnerability: { id: "CVE-2099-0001", severity: "Low" },
        },
        {
          vulnerability: { id: "CVE-2099-0002", severity: "Negligible" },
        },
      ],
      source: {
        type: "image",
        target: { imageID: imageDigest },
      },
      descriptor: { name: "grype", version: "0.116.1" },
    },
    embeddedRuntimeInventory: {
      schema_version: "noema.patch-validator-embedded-runtime-inventory.v1",
      validator_image_digest: imageDigest,
      node_version: "24.19.0",
      process_versions: {
        node: "24.19.0",
        openssl: "3.5.2",
        undici: "7.13.0",
      },
      components: [
        {
          key: "openssl",
          name: "openssl",
          version: "3.5.2",
          classification: "bundled_dependency",
          cpe: opensslCpe,
        },
        {
          key: "undici",
          name: "undici",
          version: "7.13.0",
          classification: "bundled_dependency",
          purl: undiciPurl,
        },
      ],
    },
    embeddedVulnerabilityScan: {
      schema_version: "noema.patch-validator-embedded-runtime-vulnerability-scan.v1",
      validator_image_digest: imageDigest,
      scanner: "grype@0.116.1",
      components: [
        cleanComponentScan("openssl", opensslCpe),
        {
          key: "undici",
          identity: undiciPurl,
          scanner_output: rawScannerOutput(
            undiciPurl,
            [{ vulnerability: { id: "GHSA-2099-0001", severity: "Low" } }],
            null,
          ),
        },
      ],
      ignoredMatches: [],
    },
  };
}

describe("static runtime binary evidence verifier", () => {
  it("returns exact binary inventory and independent scan evidence", () => {
    expect(verifyStaticRuntimeBinaryEvidence(validInput())).toEqual({
      binary_cataloger: "syft@1.50.0",
      binary_vulnerability_scanner: "grype@0.116.1",
      node_runtime_version: "24.19.0",
      binary_package_count: 2,
      binary_vulnerability_match_count: 2,
      blocked_binary_vulnerability_count: 0,
      embedded_runtime_component_count: 2,
      embedded_runtime_vulnerability_match_count: 1,
      blocked_embedded_runtime_vulnerability_count: 0,
    });
  });

  it("accepts Syft imageId spelling, accessPath, and string CPE serialization", () => {
    const input = validInput();
    input.binarySbom.source.metadata = { imageId: imageDigest };
    input.binarySbom.artifacts[0].locations = [{ accessPath: "/nodejs/bin/node" }];
    input.binarySbom.artifacts[0].cpes = [nodeCpe];
    expect(verifyStaticRuntimeBinaryEvidence(input).node_runtime_version).toBe("24.19.0");
  });

  it("rejects a blocking advisory on an embedded runtime dependency even when the Node CPE lane is clean", () => {
    const input = validInput();
    input.embeddedRuntimeInventory = {
      schema_version: "noema.patch-validator-embedded-runtime-inventory.v1",
      validator_image_digest: imageDigest,
      node_version: "24.19.0",
      components: [
        {
          key: "openssl",
          name: "openssl",
          version: "3.5.2",
          classification: "bundled_dependency",
          cpe: opensslCpe,
        },
      ],
    };
    input.embeddedVulnerabilityScan = {
      schema_version: "noema.patch-validator-embedded-runtime-vulnerability-scan.v1",
      validator_image_digest: imageDigest,
      scanner: "grype@0.116.1",
      matches: [
        {
          artifact: { name: "openssl", version: "3.5.2", cpes: [opensslCpe] },
          vulnerability: { id: "CVE-2099-4242", severity: "High" },
        },
      ],
      ignoredMatches: [],
    };
    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /blocking embedded runtime vulnerabilities/i,
    );
  });

  const invalidCases: Array<[string, (input: any) => void]> = [
    ["static-runtime image digest", (x) => { x.expectedImageDigest = "latest"; }],
    ["Syft SBOM record", (x) => { x.binarySbom = null; }],
    ["Syft descriptor", (x) => { x.binarySbom.descriptor = null; }],
    ["produced by Syft", (x) => { x.binarySbom.descriptor.name = "other"; }],
    ["Syft version", (x) => { x.binarySbom.descriptor.version = "1.49.0"; }],
    ["Syft source", (x) => { x.binarySbom.source = null; }],
    ["Syft source must be an image", (x) => { x.binarySbom.source.type = "directory"; }],
    ["Syft source metadata", (x) => { x.binarySbom.source.metadata = null; }],
    ["Syft image digest", (x) => { x.binarySbom.source.metadata = {}; }],
    ["Syft image digest", (x) => { x.binarySbom.source.metadata.imageID = `sha256:${"3".repeat(64)}`; }],
    ["Syft artifacts", (x) => { x.binarySbom.artifacts = null; }],
    ["Syft package", (x) => { x.binarySbom.artifacts[0] = null; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].name = "nodejs"; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].version = "24.18.0"; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].locations = null; }],
    ["Syft package location", (x) => { x.binarySbom.artifacts[0].locations = [null]; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].locations = [{ path: "/other" }]; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].cpes = null; }],
    ["Syft package CPE", (x) => { x.binarySbom.artifacts[0].cpes = [42]; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].cpes = [{ cpe: "cpe:2.3:a:other:node:24.19.0:*:*:*:*:*:*:*" }]; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].cpes = ["cpe:2.3:a:other:node:24.19.0:*:*:*:*:*:*:*"]; }],
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts.push({ ...x.binarySbom.artifacts[0] }); }],
    ["Grype vulnerability record", (x) => { x.binaryVulnerabilityScan = null; }],
    ["Grype descriptor", (x) => { x.binaryVulnerabilityScan.descriptor = null; }],
    ["produced by Grype", (x) => { x.binaryVulnerabilityScan.descriptor.name = "other"; }],
    ["Grype version", (x) => { x.binaryVulnerabilityScan.descriptor.version = "0.115.0"; }],
    ["Grype source", (x) => { x.binaryVulnerabilityScan.source = null; }],
    ["Grype source must be an image", (x) => { x.binaryVulnerabilityScan.source.type = "directory"; }],
    ["Grype image target", (x) => { x.binaryVulnerabilityScan.source.target = null; }],
    ["Grype image digest", (x) => { x.binaryVulnerabilityScan.source.target.imageID = `sha256:${"4".repeat(64)}`; }],
    ["Grype matches", (x) => { x.binaryVulnerabilityScan.matches = null; }],
    ["ignored binary vulnerability", (x) => { x.binaryVulnerabilityScan.ignoredMatches = "invalid"; }],
    ["ignored binary vulnerability", (x) => { x.binaryVulnerabilityScan.ignoredMatches = [{}]; }],
    ["Grype match", (x) => { x.binaryVulnerabilityScan.matches[0] = null; }],
    ["Grype vulnerability", (x) => { x.binaryVulnerabilityScan.matches[0].vulnerability = null; }],
    ["severity must be a string", (x) => { x.binaryVulnerabilityScan.matches[0].vulnerability.severity = 3; }],
    ["severity is unsupported", (x) => { x.binaryVulnerabilityScan.matches[0].vulnerability.severity = "Important"; }],
    ["blocking static-runtime vulnerabilities", (x) => { x.binaryVulnerabilityScan.matches[0].vulnerability.severity = "Medium"; }],
    ["blocking static-runtime vulnerabilities", (x) => { x.binaryVulnerabilityScan.matches[0].vulnerability.severity = "High"; }],
    ["blocking static-runtime vulnerabilities", (x) => { x.binaryVulnerabilityScan.matches[0].vulnerability.severity = "Critical"; }],
    ["blocking static-runtime vulnerabilities", (x) => { x.binaryVulnerabilityScan.matches[0].vulnerability.severity = "Unknown"; }],
    ["embedded runtime inventory", (x) => { x.embeddedRuntimeInventory = null; }],
    ["inventory schema", (x) => { x.embeddedRuntimeInventory.schema_version = "wrong"; }],
    ["inventory image digest", (x) => { x.embeddedRuntimeInventory.validator_image_digest = `sha256:${"4".repeat(64)}`; }],
    ["inventory Node version", (x) => { x.embeddedRuntimeInventory.node_version = "24.18.0"; }],
    ["components must be", (x) => { x.embeddedRuntimeInventory.components = null; }],
    ["components must be", (x) => { x.embeddedRuntimeInventory.components = []; }],
    ["components must be", (x) => { x.embeddedRuntimeInventory.components = Array.from({ length: 129 }, () => x.embeddedRuntimeInventory.components[0]); }],
    ["embedded runtime vulnerability scan", (x) => { x.embeddedVulnerabilityScan = null; }],
    ["scan schema", (x) => { x.embeddedVulnerabilityScan.schema_version = "wrong"; }],
    ["scan image digest", (x) => { x.embeddedVulnerabilityScan.validator_image_digest = `sha256:${"5".repeat(64)}`; }],
    ["scanner does not match", (x) => { x.embeddedVulnerabilityScan.scanner = "grype@0.1.0"; }],
    ["ignored embedded runtime vulnerability", (x) => { x.embeddedVulnerabilityScan.ignoredMatches = "invalid"; }],
    ["ignored embedded runtime vulnerability", (x) => { x.embeddedVulnerabilityScan.ignoredMatches = [{}]; }],
    ["process.versions", (x) => { x.embeddedRuntimeInventory.process_versions = null; }],
    ["process.versions Node version", (x) => { x.embeddedRuntimeInventory.process_versions.node = "24.18.0"; }],
    ["dependencies must be", (x) => { x.embeddedRuntimeInventory.process_versions = { node: "24.19.0" }; }],
    ["dependencies must be", (x) => {
      x.embeddedRuntimeInventory.process_versions = { node: "24.19.0" };
      for (let index = 0; index < 129; index += 1) x.embeddedRuntimeInventory.process_versions[`dep${index}`] = "1";
    }],
    ["embedded runtime component", (x) => { x.embeddedRuntimeInventory.components[0] = null; }],
    ["component key", (x) => { x.embeddedRuntimeInventory.components[0].key = "../openssl"; }],
    ["keys must be unique", (x) => { x.embeddedRuntimeInventory.components[1].key = "openssl"; }],
    ["classified as a bundled dependency", (x) => { x.embeddedRuntimeInventory.components[0].classification = "metadata"; }],
    ["name is invalid", (x) => { x.embeddedRuntimeInventory.components[0].name = ""; }],
    ["version does not match", (x) => { x.embeddedRuntimeInventory.components[0].version = "0"; }],
    ["no supported vulnerability identity", (x) => { delete x.embeddedRuntimeInventory.components[0].cpe; }],
    ["component set must exactly match", (x) => { x.embeddedRuntimeInventory.components.pop(); }],
    ["one result per component", (x) => { x.embeddedVulnerabilityScan.components = null; }],
    ["one result per component", (x) => { x.embeddedVulnerabilityScan.components.pop(); }],
    ["embedded runtime component scan", (x) => { x.embeddedVulnerabilityScan.components[0] = null; }],
    ["unknown component", (x) => { x.embeddedVulnerabilityScan.components[0].key = "other"; }],
    ["scan keys must be unique", (x) => { x.embeddedVulnerabilityScan.components[1].key = "openssl"; x.embeddedVulnerabilityScan.components[1].identity = opensslCpe; }],
    ["scan identity does not match", (x) => { x.embeddedVulnerabilityScan.components[0].identity = "pkg:npm/other@1"; }],
    ["raw scanner evidence", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output = null; }],
    ["raw scanner descriptor", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor = null; }],
    ["raw scanner must be produced by Grype", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.name = "other"; }],
    ["raw scanner version", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.version = "0.115.0"; }],
    ["raw scanner source", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.source = null; }],
    ["raw scanner source type", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.source.type = "sbom-file"; }],
    ["raw scanner source target", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.source.target = "other"; }],
    ["vulnerability database", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db = null; }],
    ["database status", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.status = null; }],
    ["database schema", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.status.schemaVersion = ""; }],
    ["database build timestamp", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.status.built = "yesterday"; }],
    ["database must be valid", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.status.valid = false; }],
    ["database error", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.status.error = "checksum mismatch"; }],
    ["database providers", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.providers = null; }],
    ["database provider name", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.providers = { "../nvd": { captured: "2026-08-06T00:00:00Z", input: providerDigest } }; }],
    ["database provider evidence", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.providers.nvd = null; }],
    ["provider capture timestamp", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.providers.nvd.captured = "yesterday"; }],
    ["provider input digest", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.providers.nvd.input = "latest"; }],
    ["ignored embedded runtime component", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.ignoredMatches = "invalid"; }],
    ["ignored embedded runtime component", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.ignoredMatches = [{}]; }],
    ["component openssl matches", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.matches = null; }],
    ["component openssl match", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.matches = [null]; }],
    ["component openssl vulnerability", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.matches = [{ vulnerability: null }]; }],
    ["blocking embedded runtime vulnerabilities", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.matches = [{ vulnerability: { severity: "Medium" } }]; }],
  ];

  it.each(invalidCases)("rejects %s", (message, mutate) => {
    const input = validInput();
    mutate(input);
    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      new RegExp(message, "i"),
    );
  });

  it("accepts explicit empty ignored lists and a clean aggregate compatibility list", () => {
    const input = validInput();
    input.binaryVulnerabilityScan.ignoredMatches = [];
    input.embeddedVulnerabilityScan.matches = [];
    expect(verifyStaticRuntimeBinaryEvidence(input).blocked_binary_vulnerability_count).toBe(0);
  });
});
