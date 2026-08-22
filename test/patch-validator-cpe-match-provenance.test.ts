import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"2".repeat(64)}`;
const providerDigest = `sha256:${"a".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const opensslCpe = "cpe:2.3:a:openssl:openssl:3.5.2:*:*:*:*:*:*:*";

function scannerOutput(matches: unknown[]) {
  return {
    descriptor: {
      name: "grype",
      version: "0.116.1",
      db: {
        status: {
          schemaVersion: "v6.0.2",
          built: "2026-08-19T00:00:00Z",
          valid: true,
        },
        providers: {
          nvd: {
            captured: "2026-08-19T00:00:00Z",
            input: providerDigest,
          },
        },
      },
    },
    source: { type: "cpe", target: opensslCpe },
    matches,
    ignoredMatches: [],
  };
}

function inputFor(matches: unknown[]) {
  return {
    expectedImageDigest: imageDigest,
    binarySbom: {
      descriptor: { name: "syft", version: "1.50.0" },
      source: { type: "image", metadata: { imageID: imageDigest } },
      artifacts: [
        {
          name: "node",
          version: "24.19.0",
          locations: [{ path: "/nodejs/bin/node" }],
          cpes: [nodeCpe],
        },
      ],
    },
    binaryVulnerabilityScan: {
      matches: [],
      source: { type: "image", target: { imageID: imageDigest } },
      descriptor: { name: "grype", version: "0.116.1" },
      ignoredMatches: [],
    },
    embeddedRuntimeInventory: {
      schema_version: "noema.patch-validator-embedded-runtime-inventory.v1",
      validator_image_digest: imageDigest,
      node_version: "24.19.0",
      process_versions: { node: "24.19.0", openssl: "3.5.2" },
      components: [
        {
          key: "openssl",
          name: "openssl",
          version: "3.5.2",
          classification: "bundled_dependency",
          cpe: opensslCpe,
        },
      ],
    },
    embeddedVulnerabilityScan: {
      schema_version: "noema.patch-validator-embedded-runtime-vulnerability-scan.v1",
      validator_image_digest: imageDigest,
      scanner: "grype@0.116.1",
      ignoredMatches: [],
      components: [
        {
          key: "openssl",
          identity: opensslCpe,
          scanner_output: scannerOutput(matches),
        },
      ],
    },
  };
}

function highMatch(matchDetails: unknown[]) {
  return {
    artifact: {
      name: "openssl",
      version: "3.5.2",
      cpes: [opensslCpe],
    },
    vulnerability: { id: "CVE-2099-9999", severity: "High" },
    matchDetails,
  };
}

describe("embedded CPE vulnerability provenance", () => {
  it("does not treat an unrelated ecosystem package-name match as a CPE finding", () => {
    const input = inputFor([
      highMatch([
        {
          type: "exact-direct-match",
          searchedBy: {
            namespace: "github:language:ruby",
            package: { name: "openssl", version: "3.5.2" },
          },
        },
      ]),
    ]);

    expect(verifyStaticRuntimeBinaryEvidence(input)).toMatchObject({
      embedded_runtime_vulnerability_match_count: 1,
      blocked_embedded_runtime_vulnerability_count: 0,
    });
  });

  it("still blocks a CPE finding searched by the exact reviewed identity", () => {
    const input = inputFor([
      highMatch([
        {
          type: "cpe-match",
          searchedBy: {
            namespace: "nvd:cpe",
            cpes: [opensslCpe],
            package: { name: "openssl", version: "3.5.2" },
          },
        },
      ]),
    ]);

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /blocking embedded runtime vulnerabilities/i,
    );
  });
});
