import { describe, expect, it } from "vitest";

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

function inputFor(vulnerabilityId: string, includeDisabledQuicEvidence: boolean) {
  const processVersions: Record<string, string> = {
    node: "24.19.0",
    openssl: "3.5.7",
  };
  const components: any[] = [
    {
      key: "openssl",
      name: "openssl",
      version: "3.5.7",
      classification: "bundled_dependency",
      cpe: opensslCpe,
    },
  ];

  if (includeDisabledQuicEvidence) {
    processVersions.nghttp3 = "";
    processVersions.ngtcp2 = "";
    components.push(
      {
        key: "nghttp3",
        name: "nghttp3",
        version: "",
        classification: "runtime_metadata",
        reason: "HTTP/3 dependency disabled in this build",
      },
      {
        key: "ngtcp2",
        name: "ngtcp2",
        version: "",
        classification: "runtime_metadata",
        reason: "QUIC transport dependency disabled in this build",
      },
    );
  }

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
      process_versions: processVersions,
      components,
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
  it("does not block the QUIC-listener CVE when exact runtime metadata proves QUIC and HTTP/3 dependencies are disabled", () => {
    expect(
      verifyStaticRuntimeBinaryEvidence(inputFor("CVE-2026-14456", true)),
    ).toMatchObject({
      embedded_runtime_vulnerability_match_count: 1,
      blocked_embedded_runtime_vulnerability_count: 0,
    });
  });

  it("still blocks the QUIC-listener CVE without exact disabled-QUIC runtime evidence", () => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputFor("CVE-2026-14456", false)),
    ).toThrow(/blocking embedded runtime vulnerabilities/i);
  });

  it("does not turn disabled-QUIC evidence into a blanket OpenSSL vulnerability allowlist", () => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputFor("CVE-2099-4242", true)),
    ).toThrow(/blocking embedded runtime vulnerabilities/i);
  });
});
