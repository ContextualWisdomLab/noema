import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"4".repeat(64)}`;
const providerDigestA = `sha256:${"a".repeat(64)}`;
const providerDigestB = `sha256:${"b".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const opensslCpe = "cpe:2.3:a:openssl:openssl:3.5.2:*:*:*:*:*:*:*";
const undiciPurl = "pkg:npm/undici@7.13.0";

function rawScannerOutput(
  identity: string,
  providerInput = providerDigestA,
  matches: any[] = [],
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
            input: providerInput,
          },
        },
      },
    },
    source: {
      type: identity.startsWith("pkg:") ? "purl" : "cpe",
      target: identity,
    },
    matches,
    ignoredMatches: [],
  };
}

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
        {
          key: "openssl",
          identity: opensslCpe,
          scanner_output: rawScannerOutput(opensslCpe),
        },
        {
          key: "undici",
          identity: undiciPurl,
          scanner_output: rawScannerOutput(undiciPurl),
        },
      ],
      ignoredMatches: [],
    },
  };
}

describe("embedded runtime identity binding", () => {
  it("rejects an incomplete npm PURL that does not bind package and version", () => {
    const input = validInput();
    input.embeddedRuntimeInventory.components[1].purl = "pkg:npm/";
    input.embeddedVulnerabilityScan.components[1].identity = "pkg:npm/";
    input.embeddedVulnerabilityScan.components[1].scanner_output = rawScannerOutput("pkg:npm/");

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /supported vulnerability identity|canonical.*purl|purl.*version/i,
    );
  });

  it("rejects a CPE whose product version disagrees with process.versions", () => {
    const input = validInput();
    const mismatchedCpe = "cpe:2.3:a:openssl:openssl:9.9.9:*:*:*:*:*:*:*";
    input.embeddedRuntimeInventory.components[0].cpe = mismatchedCpe;
    input.embeddedVulnerabilityScan.components[0].identity = mismatchedCpe;
    input.embeddedVulnerabilityScan.components[0].scanner_output = rawScannerOutput(mismatchedCpe);

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /cpe.*version|vulnerability identity.*version|identity.*process\.versions/i,
    );
  });

  it("rejects a vulnerability match whose artifact belongs to another package", () => {
    const input = validInput();
    input.embeddedVulnerabilityScan.components[0].scanner_output = rawScannerOutput(
      opensslCpe,
      providerDigestA,
      [
        {
          artifact: {
            name: "zlib",
            version: "1.3.1",
            cpes: ["cpe:2.3:a:zlib:zlib:1.3.1:*:*:*:*:*:*:*"]
          },
          vulnerability: { id: "CVE-2099-1000", severity: "Low" },
        },
      ],
    );

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /artifact.*identity|artifact.*component|match.*artifact/i,
    );
  });

  it("rejects vulnerability matches that omit evaluated artifact identity", () => {
    const input = validInput();
    input.embeddedVulnerabilityScan.components[1].scanner_output = rawScannerOutput(
      undiciPurl,
      providerDigestA,
      [{ vulnerability: { id: "GHSA-2099-1000", severity: "Low" } }],
    );

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /artifact.*identity|artifact.*record|match.*artifact/i,
    );
  });

  it("rejects component scans captured from different vulnerability database snapshots", () => {
    const input = validInput();
    input.embeddedVulnerabilityScan.components[1].scanner_output = rawScannerOutput(
      undiciPurl,
      providerDigestB,
    );

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /database.*identity|database.*snapshot|same.*database/i,
    );
  });
});
