import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  readBoundedJson,
  verifyPatchValidatorReceipts,
} from "../scripts/lib/patch-validator-image-receipts.mjs";

const roots: string[] = [];
const sourceRevision = "1".repeat(40);
const imageDigest = `sha256:${"2".repeat(64)}`;

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "noema-image-receipts-"));
  roots.push(root);
  return root;
}

function validInput() {
  return {
    metadata: {
      schema_version: "noema.patch-validator-image-metadata.v1",
      source_revision: sourceRevision,
      validator_image_digest: imageDigest,
      os: "linux",
      architecture: "amd64",
      user: "65532:65532",
      entrypoint: ["/nodejs/bin/node", "/opt/noema/validate-patch.mjs"],
      labels: {
        "org.opencontainers.image.source":
          "https://github.com/ContextualWisdomLab/noema",
        "org.opencontainers.image.revision": sourceRevision,
      },
    },
    smokeResult: {
      status: "passed",
      repository_full_name: "ContextualWisdomLab/noema",
      base_sha: "0".repeat(40),
      head_sha: sourceRevision,
      patch_sha256: "3".repeat(64),
      profile: "node_patch_verify",
      command_profile: "node_patch_verify_v1",
      validator_image_digest: imageDigest,
      exit_code: 0,
      duration_ms: 10,
      stdout_excerpt: "",
      stderr_excerpt: "",
      reason_codes: [],
    },
    sbom: {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
      version: 1,
      metadata: {
        component: {
          type: "container",
          name: "noema-patch-validator",
          version: sourceRevision,
        },
      },
      components: [{ type: "library", name: "typescript", version: "5.9.3" }],
    },
    expectedImageDigest: imageDigest,
    expectedSourceRevision: sourceRevision,
  };
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe("patch-validator image receipt verifier", () => {
  it("returns one exact-image and exact-source verification receipt", () => {
    expect(verifyPatchValidatorReceipts(validInput())).toEqual({
      schema_version: "noema.patch-validator-image-verification.v1",
      status: "passed",
      source_revision: sourceRevision,
      validator_image_digest: imageDigest,
      cyclonedx_spec_version: "1.6",
      component_count: 1,
    });
  });

  it.each([
    ["metadata record", (input: any) => { input.metadata = null; }],
    ["metadata schema", (input: any) => { input.metadata.schema_version = "wrong"; }],
    ["source revision", (input: any) => { input.metadata.source_revision = "f".repeat(40); }],
    ["image digest", (input: any) => { input.metadata.validator_image_digest = `sha256:${"f".repeat(64)}`; }],
    ["Linux", (input: any) => { input.metadata.os = "windows"; }],
    ["amd64", (input: any) => { input.metadata.architecture = "arm64"; }],
    ["non-root user", (input: any) => { input.metadata.user = "0:0"; }],
    ["entrypoint", (input: any) => { input.metadata.entrypoint = ["/bin/sh"]; }],
    ["labels record", (input: any) => { input.metadata.labels = null; }],
    ["source label", (input: any) => { input.metadata.labels["org.opencontainers.image.source"] = "other"; }],
    ["revision label", (input: any) => { input.metadata.labels["org.opencontainers.image.revision"] = "other"; }],
    ["smoke record", (input: any) => { input.smokeResult = null; }],
    ["smoke status", (input: any) => { input.smokeResult.status = "failed"; }],
    ["smoke exit", (input: any) => { input.smokeResult.exit_code = 1; }],
    ["smoke image digest", (input: any) => { input.smokeResult.validator_image_digest = `sha256:${"f".repeat(64)}`; }],
    ["smoke source revision", (input: any) => { input.smokeResult.head_sha = "f".repeat(40); }],
    ["smoke profile", (input: any) => { input.smokeResult.profile = "other"; }],
    ["smoke command profile", (input: any) => { input.smokeResult.command_profile = "other"; }],
    ["CycloneDX record", (input: any) => { input.sbom = null; }],
    ["CycloneDX format", (input: any) => { input.sbom.bomFormat = "SPDX"; }],
    ["CycloneDX version", (input: any) => { input.sbom.specVersion = "1.4"; }],
    ["CycloneDX components", (input: any) => { input.sbom.components = null; }],
  ])("rejects mismatched %s evidence", (message, mutate) => {
    const input = validInput();
    mutate(input);
    expect(() => verifyPatchValidatorReceipts(input)).toThrow(
      new RegExp(message, "i"),
    );
  });

  it("reads bounded regular JSON and rejects unsafe evidence files", () => {
    const root = temporaryRoot();
    const validPath = join(root, "valid.json");
    writeFileSync(validPath, '{"value":1}');
    expect(readBoundedJson(validPath, 64)).toEqual({ value: 1 });

    const emptyPath = join(root, "empty.json");
    writeFileSync(emptyPath, "");
    expect(() => readBoundedJson(emptyPath, 64)).toThrow(/byte length/);

    const oversizedPath = join(root, "oversized.json");
    writeFileSync(oversizedPath, "12345");
    expect(() => readBoundedJson(oversizedPath, 4)).toThrow(/byte length/);

    const invalidPath = join(root, "invalid.json");
    writeFileSync(invalidPath, "{");
    expect(() => readBoundedJson(invalidPath, 64)).toThrow(/valid JSON/);

    const directoryPath = join(root, "directory.json");
    mkdirSync(directoryPath);
    expect(() => readBoundedJson(directoryPath, 64)).toThrow(/regular file/);

    const symlinkPath = join(root, "link.json");
    symlinkSync(validPath, symlinkPath);
    expect(() => readBoundedJson(symlinkPath, 64)).toThrow(/regular file/);
  });
});
