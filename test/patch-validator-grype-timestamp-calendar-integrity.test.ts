import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"8".repeat(64)}`;
const providerDigest = `sha256:${"9".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const opensslCpe = "cpe:2.3:a:openssl:openssl:3.5.2:*:*:*:*:*:*:*";

function validInput(): any {
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
      descriptor: { name: "grype", version: "0.116.1" },
      source: { type: "image", target: { imageID: imageDigest } },
      matches: [],
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
      components: [
        {
          key: "openssl",
          identity: opensslCpe,
          scanner_output: {
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
            source: { type: "cpe", target: opensslCpe },
            matches: [],
            ignoredMatches: [],
          },
        },
      ],
      ignoredMatches: [],
    },
  };
}

describe("Grype database timestamp calendar integrity", () => {
  it("rejects an impossible database build calendar date", () => {
    const input = validInput();
    input.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.status.built =
      "2026-02-30T00:00:00Z";

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /database build timestamp is invalid/i,
    );
  });

  it("rejects an impossible provider capture calendar date", () => {
    const input = validInput();
    input.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.providers.nvd.captured =
      "2026-02-30T00:00:00Z";

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /provider capture timestamp is invalid/i,
    );
  });

  it("rejects an impossible database build month", () => {
    const input = validInput();
    input.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.status.built =
      "2026-13-01T00:00:00Z";

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /database build timestamp is invalid/i,
    );
  });

  it("rejects an out-of-range provider capture clock time", () => {
    const input = validInput();
    input.embeddedVulnerabilityScan.components[0].scanner_output.descriptor.db.providers.nvd.captured =
      "2026-08-06T25:00:00Z";

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /provider capture timestamp is invalid/i,
    );
  });
});
