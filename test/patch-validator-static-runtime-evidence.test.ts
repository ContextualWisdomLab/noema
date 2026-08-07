import { describe, expect, it } from "vitest";

import { verifyStaticRuntimeBinaryEvidence } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

const imageDigest = `sha256:${"2".repeat(64)}`;

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
          cpes: ["cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*"],
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
    });
  });

  it("accepts Syft imageId spelling and accessPath binary location", () => {
    const input = validInput();
    input.binarySbom.source.metadata = { imageId: imageDigest };
    input.binarySbom.artifacts[0].locations = [{ accessPath: "/nodejs/bin/node" }];
    expect(verifyStaticRuntimeBinaryEvidence(input).node_runtime_version).toBe("24.19.0");
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
    ["exactly one expected static Node", (x) => { x.binarySbom.artifacts[0].cpes = [42]; }],
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
  ];

  it.each(invalidCases)("rejects %s", (message, mutate) => {
    const input = validInput();
    mutate(input);
    expect(() => verifyStaticRuntimeBinaryEvidence(input)).toThrow(
      new RegExp(message, "i"),
    );
  });

  it("accepts an explicit empty ignored match list", () => {
    const input = validInput();
    input.binaryVulnerabilityScan.ignoredMatches = [];
    expect(verifyStaticRuntimeBinaryEvidence(input).blocked_binary_vulnerability_count).toBe(0);
  });
});
