import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { generateEmbeddedRuntimeInventory } from "../scripts/lib/patch-validator-embedded-runtime-inventory.mjs";
import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"2".repeat(64)}`;
const providerDigest = `sha256:${"a".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const opensslCpe = "cpe:2.3:a:openssl:openssl:3.5.7:*:*:*:*:*:*:*";

function scannerOutput(vulnerabilityId: string) {
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
    matches: [
      {
        artifact: {
          name: "openssl",
          version: "3.5.7",
          cpes: [opensslCpe],
        },
        vulnerability: { id: vulnerabilityId, severity: "High" },
        matchDetails: [
          {
            type: "cpe-match",
            searchedBy: {
              namespace: "nvd:cpe",
              cpes: [opensslCpe],
              package: { name: "openssl", version: "3.5.7" },
            },
          },
        ],
      },
    ],
    ignoredMatches: [],
  };
}

function inputFor(vulnerabilityId: string, nodeUseQuic: boolean) {
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
      process_versions: { node: "24.19.0", openssl: "3.5.7" },
      node_build_features: { node_use_quic: nodeUseQuic },
      components: [
        {
          key: "openssl",
          name: "openssl",
          version: "3.5.7",
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
          scanner_output: scannerOutput(vulnerabilityId),
        },
      ],
    },
  };
}

describe("OpenSSL QUIC-server applicability evidence", () => {
  it("retains the exact Node QUIC build feature in the embedded runtime inventory", () => {
    const { inventory } = generateEmbeddedRuntimeInventory(
      { node: "24.19.0", openssl: "3.5.7" },
      imageDigest,
      { node_use_quic: false },
    );

    expect(inventory.node_build_features).toEqual({ node_use_quic: false });
  });

  it("requires the dedicated image workflow to collect the exact runtime QUIC build feature", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/patch-validator-image.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("process.config.variables.node_use_quic");
    expect(workflow).toContain("NODE_BUILD_FEATURES_PATH");
    expect(workflow).toContain("buildFeatures");
  });

  it("does not block the OpenSSL QUIC-listener CVE when the exact Node binary proves QUIC was not compiled", () => {
    expect(
      verifyStaticRuntimeBinaryEvidence(inputFor("CVE-2026-14456", false)),
    ).toMatchObject({
      embedded_runtime_vulnerability_match_count: 1,
      blocked_embedded_runtime_vulnerability_count: 0,
    });
  });

  it("still blocks the OpenSSL QUIC-listener CVE when QUIC is compiled", () => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputFor("CVE-2026-14456", true)),
    ).toThrow(/blocking embedded runtime vulnerabilities/i);
  });

  it("does not turn QUIC-disabled evidence into a blanket OpenSSL vulnerability allowlist", () => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputFor("CVE-2099-4242", false)),
    ).toThrow(/blocking embedded runtime vulnerabilities/i);
  });
});
