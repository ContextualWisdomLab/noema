import { O_NOFOLLOW, O_RDONLY } from "node:constants";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

const SHA1 = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SUPPORTED_CYCLONEDX_VERSIONS = new Set(["1.5", "1.6", "1.7"]);
const EXPECTED_SOURCE_LABEL = "https://github.com/ContextualWisdomLab/noema";
const EXPECTED_ENTRYPOINT = [
  "/nodejs/bin/node",
  "--input-type=module",
  "--eval",
  "import { runCli } from '/opt/noema/runtime.mjs'; const result = runCli(); if (result.status !== 'passed') process.exitCode = Number.isInteger(result.exit_code) && result.exit_code > 0 ? result.exit_code : 1;",
];
const DEFAULT_RECEIPT_FILE_SYSTEM = Object.freeze({
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
});

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

function receiptByteLengthIsValid(size, maximumBytes) {
  return size > 0 && size <= maximumBytes;
}

export function readBoundedJson(
  path,
  maximumBytes = MAX_RECEIPT_BYTES,
  fileSystem = DEFAULT_RECEIPT_FILE_SYSTEM,
) {
  const pathMetadata = fileSystem.lstatSync(path);
  requireCondition(pathMetadata.isFile(), "receipt must be a regular file");
  requireCondition(
    receiptByteLengthIsValid(pathMetadata.size, maximumBytes),
    "receipt has an invalid byte length",
  );

  const descriptor = fileSystem.openSync(path, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fileSystem.fstatSync(descriptor);
    requireCondition(
      receiptByteLengthIsValid(before.size, maximumBytes),
      "receipt has an invalid byte length",
    );
    requireCondition(
      pathMetadata.dev === before.dev && pathMetadata.ino === before.ino,
      "receipt changed while it was being opened",
    );

    const buffer = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fileSystem.readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        null,
      );
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }

    const after = fileSystem.fstatSync(descriptor);
    requireCondition(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size,
      "receipt changed while it was being read",
    );
    requireCondition(
      offset === before.size,
      "receipt changed while it was being read",
    );

    try {
      return JSON.parse(buffer.subarray(0, offset).toString("utf8"));
    } catch (error) {
      throw new Error("receipt must contain valid JSON", { cause: error });
    }
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

function expectedImageReference(expectedSourceRevision) {
  return `noema-patch-validator:${expectedSourceRevision}`;
}

function verifyCycloneDxReceipt(
  sbom,
  expectedImageDigest,
  expectedSourceRevision,
) {
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
  const cyclonedxMetadata = requireRecord(
    cyclonedx.metadata,
    "CycloneDX metadata record",
  );
  const subject = requireRecord(
    cyclonedxMetadata.component,
    "CycloneDX component record",
  );
  requireCondition(
    subject.type === "container",
    "CycloneDX component type must be container",
  );
  requireCondition(
    subject.name === expectedImageReference(expectedSourceRevision),
    "CycloneDX image reference does not match",
  );
  requireCondition(
    Array.isArray(subject.properties),
    "CycloneDX properties must be an array",
  );
  const imageIdentity = subject.properties.find(
    (property) => property?.name === "aquasecurity:trivy:ImageID",
  );
  requireCondition(
    imageIdentity?.value === expectedImageDigest,
    "CycloneDX image digest does not match",
  );
  return cyclonedx;
}

function verifyVulnerabilityReceipt(
  vulnerabilityScan,
  expectedImageDigest,
  expectedSourceRevision,
) {
  const scan = requireRecord(
    vulnerabilityScan,
    "vulnerability scan record",
  );
  requireCondition(
    scan.ArtifactType === "container_image",
    "vulnerability artifact type does not match",
  );
  requireCondition(
    scan.ArtifactName === expectedImageReference(expectedSourceRevision),
    "vulnerability image reference does not match",
  );
  const scanMetadata = requireRecord(
    scan.Metadata,
    "vulnerability metadata record",
  );
  requireCondition(
    scanMetadata.ImageID === expectedImageDigest,
    "vulnerability image digest does not match",
  );
  requireCondition(
    Array.isArray(scan.Results) && scan.Results.length > 0,
    "vulnerability results must be a non-empty array",
  );

  let detectedVulnerabilityCount = 0;
  for (const rawResult of scan.Results) {
    const result = requireRecord(rawResult, "vulnerability result record");
    requireCondition(
      result.Vulnerabilities == null || Array.isArray(result.Vulnerabilities),
      "vulnerability result entries are invalid",
    );
    if (Array.isArray(result.Vulnerabilities)) {
      detectedVulnerabilityCount += result.Vulnerabilities.length;
    }
  }
  requireCondition(
    detectedVulnerabilityCount === 0,
    "detected vulnerabilities are not allowed",
  );
  return {
    resultCount: scan.Results.length,
    detectedVulnerabilityCount,
  };
}

export function verifyPatchValidatorReceipts({
  metadata,
  smokeResult,
  sbom,
  vulnerabilityScan,
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

  const cyclonedx = verifyCycloneDxReceipt(
    sbom,
    expectedImageDigest,
    expectedSourceRevision,
  );
  const vulnerability = verifyVulnerabilityReceipt(
    vulnerabilityScan,
    expectedImageDigest,
    expectedSourceRevision,
  );

  return {
    schema_version: "noema.patch-validator-image-verification.v1",
    status: "passed",
    source_revision: expectedSourceRevision,
    validator_image_digest: expectedImageDigest,
    cyclonedx_spec_version: cyclonedx.specVersion,
    component_count: cyclonedx.components.length,
    vulnerability_result_count: vulnerability.resultCount,
    detected_vulnerability_count: vulnerability.detectedVulnerabilityCount,
  };
}
