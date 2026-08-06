import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readBoundedJson,
  verifyPatchValidatorReceipts,
} from "../scripts/lib/patch-validator-image-receipts.mjs";

const roots: string[] = [];
const sourceRevision = "1".repeat(40);
const imageDigest = `sha256:${"2".repeat(64)}`;
const imageReference = `noema-patch-validator:${sourceRevision}`;
const entrypoint = [
  "/nodejs/bin/node",
  "--input-type=module",
  "--eval",
  "import { runCli } from '/opt/noema/runtime.mjs'; const result = runCli(); if (result.status !== 'passed') process.exitCode = Number.isInteger(result.exit_code) && result.exit_code > 0 ? result.exit_code : 1;",
];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "noema-image-receipts-"));
  roots.push(root);
  return root;
}

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
          name: imageReference,
          properties: [
            {
              name: "aquasecurity:trivy:ImageID",
              value: imageDigest,
            },
          ],
        },
      },
      components: [{ type: "library", name: "typescript", version: "5.9.3" }],
    },
    vulnerabilityScan: {
      SchemaVersion: 2,
      ArtifactName: imageReference,
      ArtifactType: "container_image",
      Metadata: {
        ImageID: imageDigest,
      },
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

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("patch-validator image receipt verifier", () => {
  it("returns exact image, source, SBOM, and vulnerability evidence", () => {
    expect(verifyPatchValidatorReceipts(validInput())).toEqual({
      schema_version: "noema.patch-validator-image-verification.v1",
      status: "passed",
      source_revision: sourceRevision,
      validator_image_digest: imageDigest,
      cyclonedx_spec_version: "1.6",
      component_count: 1,
      vulnerability_result_count: 1,
      detected_vulnerability_count: 0,
    });
  });

  const invalidCases: Array<[string, (input: any) => void]> = [
    ["metadata record", (x) => { x.metadata = null; }],
    ["metadata schema", (x) => { x.metadata.schema_version = "wrong"; }],
    ["source revision", (x) => { x.metadata.source_revision = "f".repeat(40); }],
    ["image digest", (x) => { x.metadata.validator_image_digest = `sha256:${"f".repeat(64)}`; }],
    ["Linux", (x) => { x.metadata.os = "windows"; }],
    ["amd64", (x) => { x.metadata.architecture = "arm64"; }],
    ["non-root user", (x) => { x.metadata.user = "0:0"; }],
    ["entrypoint", (x) => { x.metadata.entrypoint = ["unexpected"]; }],
    ["labels record", (x) => { x.metadata.labels = null; }],
    ["source label", (x) => { x.metadata.labels["org.opencontainers.image.source"] = "other"; }],
    ["revision label", (x) => { x.metadata.labels["org.opencontainers.image.revision"] = "other"; }],
    ["smoke record", (x) => { x.smokeResult = null; }],
    ["smoke status", (x) => { x.smokeResult.status = "failed"; }],
    ["smoke exit", (x) => { x.smokeResult.exit_code = 1; }],
    ["smoke image digest", (x) => { x.smokeResult.validator_image_digest = `sha256:${"f".repeat(64)}`; }],
    ["smoke source revision", (x) => { x.smokeResult.head_sha = "f".repeat(40); }],
    ["smoke profile", (x) => { x.smokeResult.profile = "other"; }],
    ["smoke command profile", (x) => { x.smokeResult.command_profile = "other"; }],
    ["CycloneDX record", (x) => { x.sbom = null; }],
    ["CycloneDX format", (x) => { x.sbom.bomFormat = "SPDX"; }],
    ["CycloneDX version", (x) => { x.sbom.specVersion = "1.4"; }],
    ["CycloneDX components", (x) => { x.sbom.components = null; }],
    ["CycloneDX metadata", (x) => { x.sbom.metadata = null; }],
    ["CycloneDX component", (x) => { x.sbom.metadata.component = null; }],
    ["CycloneDX image reference", (x) => { x.sbom.metadata.component.name = "other"; }],
    ["CycloneDX properties", (x) => { x.sbom.metadata.component.properties = null; }],
    ["CycloneDX image digest", (x) => { x.sbom.metadata.component.properties[0].value = `sha256:${"f".repeat(64)}`; }],
    ["vulnerability scan record", (x) => { x.vulnerabilityScan = null; }],
    ["vulnerability artifact type", (x) => { x.vulnerabilityScan.ArtifactType = "filesystem"; }],
    ["vulnerability image reference", (x) => { x.vulnerabilityScan.ArtifactName = "other"; }],
    ["vulnerability metadata", (x) => { x.vulnerabilityScan.Metadata = null; }],
    ["vulnerability image digest", (x) => { x.vulnerabilityScan.Metadata.ImageID = `sha256:${"f".repeat(64)}`; }],
    ["vulnerability results", (x) => { x.vulnerabilityScan.Results = null; }],
    ["detected vulnerabilities", (x) => { x.vulnerabilityScan.Results[0].Vulnerabilities = [{ VulnerabilityID: "CVE-2099-0001" }]; }],
  ];

  it.each(invalidCases)("rejects mismatched %s evidence", (message, mutate) => {
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

  it("rechecks the descriptor byte bound before reading a raced receipt", () => {
    const root = temporaryRoot();
    const validPath = join(root, "valid.json");
    writeFileSync(validPath, '{"value":1}');
    const readSync = vi.fn(() => {
      throw new Error("unbounded descriptor read attempted");
    });
    const closeSync = vi.fn();
    const racedFileSystem = {
      lstatSync: () => ({
        isFile: () => true,
        size: 11,
        dev: 1,
        ino: 2,
      }),
      openSync: () => 42,
      fstatSync: () => ({
        isFile: () => true,
        size: 65,
        dev: 1,
        ino: 2,
      }),
      readSync,
      closeSync,
    };

    expect(() => readBoundedJson(validPath, 64, racedFileSystem)).toThrow(
      /byte length/,
    );
    expect(readSync).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledWith(42);
  });
});
