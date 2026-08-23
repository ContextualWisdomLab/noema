import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"2".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const undiciPurl = "pkg:npm/undici@7.13.0";

function inputWithProviderDigest(providerInput: string): any {
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
      ignoredMatches: [],
      source: { type: "image", target: { imageID: imageDigest } },
      descriptor: { name: "grype", version: "0.116.1" },
    },
    embeddedRuntimeInventory: {
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
    },
    embeddedVulnerabilityScan: {
      schema_version: "noema.patch-validator-embedded-runtime-vulnerability-scan.v1",
      validator_image_digest: imageDigest,
      scanner: "grype@0.116.1",
      ignoredMatches: [],
      components: [
        {
          key: "undici",
          identity: undiciPurl,
          scanner_output: {
            descriptor: {
              name: "grype",
              version: "0.116.1",
              db: {
                status: {
                  schemaVersion: "v6.1.9",
                  built: "2026-08-19T06:16:13Z",
                  valid: true,
                },
                providers: {
                  nvd: {
                    captured: "2026-08-19T00:17:15Z",
                    input: providerInput,
                  },
                },
              },
            },
            source: { type: "purl", target: undiciPurl },
            matches: [],
            ignoredMatches: [],
          },
        },
      ],
    },
  };
}

describe("Grype embedded-runtime database provenance", () => {
  it("accepts the lowercase xxh64 provider input emitted by pinned Grype", () => {
    const receipt = verifyStaticRuntimeBinaryEvidence(
      inputWithProviderDigest("xxh64:8c4d8c40f49f17a4"),
    );
    expect(receipt.embedded_runtime_vulnerability_database_identity).toContain(
      "xxh64:8c4d8c40f49f17a4",
    );
  });

  it.each([
    "xxh64:8c4d8c40f49f17a",
    "xxh64:8C4D8C40F49F17A4",
    "xxh64:8c4d8c40f49f17a4suffix",
    "md5:8c4d8c40f49f17a4",
  ])("rejects malformed provider provenance %s", (providerInput) => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputWithProviderDigest(providerInput)),
    ).toThrow(/database provider input digest is invalid/i);
  });
});
