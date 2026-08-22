import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"7".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const opensslCpe = "cpe:2.3:a:openssl:openssl:3.5.2:*:*:*:*:*:*:*";

function inputWithUnassessedZeroMatchComponent(): any {
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
      },
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
          matches: [],
          ignoredMatches: [],
        },
      ],
      ignoredMatches: [],
    },
  };
}

function inputWithUnsupportedGenericSelfAssessment(): any {
  const input = inputWithUnassessedZeroMatchComponent();
  const genericPurl = "pkg:generic/openssl@3.5.2";
  input.embeddedRuntimeInventory.components[0] = {
    key: "openssl",
    name: "openssl",
    version: "3.5.2",
    classification: "bundled_dependency",
    purl: genericPurl,
  };
  input.embeddedVulnerabilityScan.components[0] = {
    key: "openssl",
    identity: genericPurl,
    matches: [],
    ignoredMatches: [],
    assessment: {
      status: "completed",
      scanner: "grype@0.116.1",
      identity: genericPurl,
    },
  };
  return input;
}

function inputWithSyntheticCompletedAssessment(): any {
  const input = inputWithUnassessedZeroMatchComponent();
  input.embeddedVulnerabilityScan.components[0].assessment = {
    status: "completed",
    scanner: "grype@0.116.1",
    identity: opensslCpe,
  };
  return input;
}

describe("embedded runtime scanner assessment evidence", () => {
  it("rejects a zero-match component without raw scanner evidence for its reviewed identity", () => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputWithUnassessedZeroMatchComponent()),
    ).toThrow(/raw scanner evidence/i);
  });

  it("rejects a locally completed zero-match assessment for an unsupported generic identity", () => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputWithUnsupportedGenericSelfAssessment()),
    ).toThrow(/supported vulnerability identity|reviewed identity catalog/i);
  });

  it("rejects a synthetic completed assessment that is not bound to raw scanner evidence", () => {
    expect(() =>
      verifyStaticRuntimeBinaryEvidence(inputWithSyntheticCompletedAssessment()),
    ).toThrow(/raw scanner evidence/i);
  });
});
