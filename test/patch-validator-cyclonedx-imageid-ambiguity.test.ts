import { describe, expect, it } from "vitest";
import { verifyPatchValidatorReceipts } from "../scripts/lib/patch-validator-image-receipts.mjs";

const sourceRevision = "1".repeat(40);
const imageDigest = `sha256:${"2".repeat(64)}`;
const imageReference = `noema-patch-validator:${sourceRevision}`;
const entrypoint = [
  "/nodejs/bin/node",
  "--input-type=module",
  "--eval",
  "import { runCli } from '/opt/noema/runtime.mjs'; import { runEntrypoint } from '/opt/noema/entrypoint.mjs'; process.exitCode = runEntrypoint({ runCliImpl: runCli, writeDiagnostic: (message) => process.stderr.write(message) });",
];

function validInput(): any {
  return {
    metadata: {
      schema_version: "noema.patch-validator-image-metadata.v1",
      source_revision: sourceRevision,
      validator_image_digest: imageDigest,
      os: "linux",
      architecture: "amd64",
      user: "65532:65532",
      entrypoint,
      labels: {
        "org.opencontainers.image.source": "https://github.com/ContextualWisdomLab/noema",
        "org.opencontainers.image.revision": sourceRevision,
      },
    },
    smokeResult: {
      status: "passed",
      repository_full_name: "ContextualWisdomLab/noema",
      validator_image_digest: imageDigest,
      head_sha: sourceRevision,
      profile: "node_patch_verify",
      command_profile: "node_patch_verify_v1",
      exit_code: 0,
    },
    sbom: {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      metadata: {
        component: {
          type: "container",
          name: imageReference,
          properties: [
            { name: "aquasecurity:trivy:ImageID", value: imageDigest },
          ],
        },
      },
      components: [],
    },
    vulnerabilityScan: {
      ArtifactName: imageReference,
      ArtifactType: "container_image",
      Metadata: { ImageID: imageDigest },
      Results: [
        {
          Target: imageReference,
          Class: "os-pkgs",
          Type: "debian",
          Vulnerabilities: null,
        },
      ],
    },
    expectedImageDigest: imageDigest,
    expectedSourceRevision: sourceRevision,
  };
}

describe("patch-validator CycloneDX image identity", () => {
  it("rejects ambiguous duplicate Trivy ImageID properties", () => {
    const input = validInput();
    input.sbom.metadata.component.properties.push({
      name: "aquasecurity:trivy:ImageID",
      value: `sha256:${"f".repeat(64)}`,
    });

    expect(() => verifyPatchValidatorReceipts(input)).toThrow(
      /CycloneDX image digest property must appear exactly once/i,
    );
  });
});
