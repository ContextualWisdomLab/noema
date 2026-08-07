import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"7".repeat(64)}`;
const nodeCpe = "cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*";
const opensslCpe = "cpe:2.3:a:openssl:openssl:3.5.2:*:*:*:*:*:*:*";

function assessment(identity: string): any {
  return {
    status: "completed",
    scanner: "grype@0.116.1",
    identity,
  };
}

function inputWithRuntimeMetadata(): any {
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
        modules: "137",
        napi: "10",
        openssl: "3.5.2",
      },
      components: [
        {
          key: "modules",
          name: "node_modules_abi",
          version: "137",
          classification: "runtime_metadata",
          reason: "Node.js native module ABI version",
        },
        {
          key: "napi",
          name: "node_api_level",
          version: "10",
          classification: "runtime_metadata",
          reason: "Node-API compatibility level",
        },
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
          assessment: assessment(opensslCpe),
        },
      ],
      ignoredMatches: [],
    },
  };
}

function addNgtcp2(input: any, version: string): void {
  const purl = `pkg:generic/ngtcp2@${version}`;
  input.embeddedRuntimeInventory.process_versions.ngtcp2 = version;
  input.embeddedRuntimeInventory.components.push({
    key: "ngtcp2",
    name: "ngtcp2",
    version,
    classification: "bundled_dependency",
    purl,
  });
  input.embeddedVulnerabilityScan.components.push({
    key: "ngtcp2",
    identity: purl,
    matches: [],
    ignoredMatches: [],
    assessment: assessment(purl),
  });
}

describe("static runtime metadata classification", () => {
  it("keeps ABI metadata exhaustive without pretending it is a vulnerable package", () => {
    expect(verifyStaticRuntimeBinaryEvidence(inputWithRuntimeMetadata())).toMatchObject({
      embedded_runtime_component_count: 3,
      embedded_runtime_vulnerability_match_count: 0,
      blocked_embedded_runtime_vulnerability_count: 0,
    });
  });

  it("rejects runtime-metadata classification for a real bundled dependency", () => {
    const input = inputWithRuntimeMetadata();
    input.embeddedRuntimeInventory.components[2] = {
      key: "openssl",
      name: "openssl",
      version: "3.5.2",
      classification: "runtime_metadata",
      reason: "Node.js native module ABI version",
    };
    input.embeddedVulnerabilityScan.components = [];
    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /runtime metadata classification is not allowed/i,
    );
  });

  it("requires the reviewed explanation for each metadata field", () => {
    const input = inputWithRuntimeMetadata();
    input.embeddedRuntimeInventory.components[0].reason = "metadata";
    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /runtime metadata reason does not match/i,
    );
  });

  it("rejects package identities on metadata-only fields", () => {
    const input = inputWithRuntimeMetadata();
    input.embeddedRuntimeInventory.components[1].purl = "pkg:generic/napi@10";
    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /runtime metadata must not declare a vulnerability identity/i,
    );
  });

  it("rejects vulnerability scans that masquerade metadata as a package", () => {
    const input = inputWithRuntimeMetadata();
    input.embeddedVulnerabilityScan.components.push({
      key: "modules",
      identity: "pkg:generic/node-modules-abi@137",
      matches: [],
      ignoredMatches: [],
      assessment: assessment("pkg:generic/node-modules-abi@137"),
    });
    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /one result per bundled dependency/i,
    );
  });

  it("does not let a scanner blind spot clear the bundled ngtcp2 version from Node 24.19.0", () => {
    const input = inputWithRuntimeMetadata();
    addNgtcp2(input, "1.15.1");

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /known vulnerable embedded runtime dependency.*ngtcp2.*1\.15\.1.*1\.22\.1/i,
    );
  });

  it("fails closed when the bundled ngtcp2 version is not a stable numeric release", () => {
    const input = inputWithRuntimeMetadata();
    addNgtcp2(input, "1.22.1-rc.1");

    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      /known vulnerable embedded runtime dependency.*ngtcp2.*1\.22\.1-rc\.1.*1\.22\.1/i,
    );
  });

  it.each(["1.22.1", "1.22.2", "1.23.0", "2.0.0"])(
    "accepts ngtcp2 %s at or above the reviewed fixed floor when scanner evidence is clean",
    (version) => {
      const input = inputWithRuntimeMetadata();
      addNgtcp2(input, version);
      expect(() => verifyStaticRuntimeBinaryEvidence(input)).not.toThrow();
    },
  );
});
