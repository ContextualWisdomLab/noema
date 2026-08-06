import { O_NOFOLLOW, O_RDONLY } from "node:constants";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

const SHA1 = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SUPPORTED_CYCLONEDX_VERSIONS = new Set(["1.5", "1.6", "1.7"]);
const EXPECTED_SOURCE_LABEL = "https://github.com/ContextualWisdomLab/noema";
const EXPECTED_ENTRYPOINT = [
  "/nodejs/bin/node",
  "/opt/noema/validate-patch.mjs",
];

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireRecord(value, label) {
  requireCondition(
    Object.prototype.toString.call(value) === "[object Object]",
    `${label} must be a JSON record`,
  );
  return value;
}

export function readBoundedJson(path, maximumBytes = MAX_RECEIPT_BYTES) {
  const pathMetadata = lstatSync(path);
  requireCondition(pathMetadata.isFile(), "receipt must be a regular file");
  requireCondition(pathMetadata.size > 0, "receipt has an invalid byte length");
  requireCondition(
    pathMetadata.size <= maximumBytes,
    "receipt has an invalid byte length",
  );

  const descriptor = openSync(path, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    requireCondition(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        bytes.length === before.size,
      "receipt changed while it was being read",
    );
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new Error("receipt must contain valid JSON", { cause: error });
    }
  } finally {
    closeSync(descriptor);
  }
}

export function verifyPatchValidatorReceipts({
  metadata,
  smokeResult,
  sbom,
  expectedImageDigest,
  expectedSourceRevision,
}) {
  requireCondition(
    IMAGE_DIGEST.test(String(expectedImageDigest)),
    "expected image digest is invalid",
  );
  requireCondition(
    SHA1.test(String(expectedSourceRevision)),
    "expected source revision is invalid",
  );

  const imageMetadata = requireRecord(metadata, "metadata record");
  requireCondition(
    imageMetadata.schema_version === "noema.patch-validator-image-metadata.v1",
    "metadata schema is invalid",
  );
  requireCondition(
    imageMetadata.source_revision === expectedSourceRevision,
    "source revision does not match",
  );
  requireCondition(
    imageMetadata.validator_image_digest === expectedImageDigest,
    "image digest does not match",
  );
  requireCondition(imageMetadata.os === "linux", "image OS must be Linux");
  requireCondition(
    imageMetadata.architecture === "amd64",
    "image architecture must be amd64",
  );
  requireCondition(
    imageMetadata.user === "65532:65532",
    "image must use the expected non-root user",
  );
  requireCondition(
    JSON.stringify(imageMetadata.entrypoint) === JSON.stringify(EXPECTED_ENTRYPOINT),
    "image entrypoint does not match",
  );
  const labels = requireRecord(imageMetadata.labels, "labels record");
  requireCondition(
    labels["org.opencontainers.image.source"] === EXPECTED_SOURCE_LABEL,
    "image source label does not match",
  );
  requireCondition(
    labels["org.opencontainers.image.revision"] === expectedSourceRevision,
    "image revision label does not match",
  );

  const smoke = requireRecord(smokeResult, "smoke record");
  requireCondition(smoke.status === "passed", "smoke status is not passed");
  requireCondition(smoke.exit_code === 0, "smoke exit code is not zero");
  requireCondition(
    smoke.validator_image_digest === expectedImageDigest,
    "smoke image digest does not match",
  );
  requireCondition(
    smoke.head_sha === expectedSourceRevision,
    "smoke source revision does not match",
  );
  requireCondition(
    smoke.profile === "node_patch_verify",
    "smoke profile does not match",
  );
  requireCondition(
    smoke.command_profile === "node_patch_verify_v1",
    "smoke command profile does not match",
  );

  const cyclonedx = requireRecord(sbom, "CycloneDX record");
  requireCondition(
    cyclonedx.bomFormat === "CycloneDX",
    "CycloneDX format is invalid",
  );
  requireCondition(
    SUPPORTED_CYCLONEDX_VERSIONS.has(String(cyclonedx.specVersion)),
    "CycloneDX version is unsupported",
  );
  requireCondition(
    Array.isArray(cyclonedx.components),
    "CycloneDX components must be an array",
  );

  return {
    schema_version: "noema.patch-validator-image-verification.v1",
    status: "passed",
    source_revision: expectedSourceRevision,
    validator_image_digest: expectedImageDigest,
    cyclonedx_spec_version: cyclonedx.specVersion,
    component_count: cyclonedx.components.length,
  };
}
