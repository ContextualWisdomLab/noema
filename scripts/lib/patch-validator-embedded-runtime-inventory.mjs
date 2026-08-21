import {
  DISABLED_RUNTIME_METADATA_REASONS,
  REVIEWED_COMPONENT_IDENTITIES,
  RUNTIME_METADATA_REASONS,
  reviewedIdentityFor,
} from "./patch-validator-embedded-runtime-catalog.mjs";

const COMPONENT_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EXPECTED_NODE_VERSION = "24.19.0";
const VALIDATOR_IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function validateVersion(key, version, { allowEmpty = false } = {}) {
  if (
    typeof version !== "string" ||
    (!allowEmpty && version.length === 0) ||
    version.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(version)
  ) {
    throw new Error(`process.versions ${key} has an invalid version`);
  }
}

function normalizeNodeBuildFeatures(nodeBuildFeatures) {
  if (nodeBuildFeatures === undefined) {
    return undefined;
  }
  if (!isRecord(nodeBuildFeatures)) {
    throw new Error("Node build features evidence must be a JSON record");
  }
  const keys = Object.keys(nodeBuildFeatures);
  if (
    keys.length !== 1
    || keys[0] !== "node_use_quic"
    || typeof nodeBuildFeatures.node_use_quic !== "boolean"
  ) {
    throw new Error("Node build features must contain exactly one boolean node_use_quic value");
  }
  return { node_use_quic: nodeBuildFeatures.node_use_quic };
}

export function generateEmbeddedRuntimeInventory(
  versions,
  validatorImageDigest,
  nodeBuildFeatures,
) {
  if (
    typeof validatorImageDigest !== "string"
    || !VALIDATOR_IMAGE_DIGEST.test(validatorImageDigest)
  ) {
    throw new Error("validator image digest must be an exact lowercase sha256 digest");
  }
  if (!isRecord(versions)) {
    throw new Error("process.versions evidence must be a JSON record");
  }
  if (versions.node !== EXPECTED_NODE_VERSION) {
    throw new Error("process.versions Node version does not match the reviewed runtime");
  }
  const normalizedNodeBuildFeatures = normalizeNodeBuildFeatures(nodeBuildFeatures);

  const components = [];
  const scanPlan = [];
  const keys = Object.keys(versions).filter((key) => key !== "node").sort();
  for (const key of keys) {
    if (!COMPONENT_KEY.test(key)) {
      throw new Error(`process.versions dependency ${key} has an invalid key`);
    }
    const version = versions[key];

    if (version === "" && DISABLED_RUNTIME_METADATA_REASONS.has(key)) {
      validateVersion(key, version, { allowEmpty: true });
      components.push({
        key,
        name: key,
        version,
        classification: "runtime_metadata",
        reason: DISABLED_RUNTIME_METADATA_REASONS.get(key),
      });
      continue;
    }

    validateVersion(key, version);
    if (RUNTIME_METADATA_REASONS.has(key)) {
      components.push({
        key,
        name: key,
        version,
        classification: "runtime_metadata",
        reason: RUNTIME_METADATA_REASONS.get(key),
      });
      continue;
    }

    if (!REVIEWED_COMPONENT_IDENTITIES.has(key)) {
      throw new Error(
        `process.versions dependency ${key} has no reviewed vulnerability identity`,
      );
    }
    const identityFields = reviewedIdentityFor(key, version);
    const identity = identityFields.purl ?? identityFields.cpe;
    components.push({
      key,
      name: identityFields.name,
      version,
      classification: "bundled_dependency",
      ...(identityFields.purl ? { purl: identityFields.purl } : { cpe: identityFields.cpe }),
    });
    scanPlan.push({ key, identity });
  }

  if (scanPlan.length === 0) {
    throw new Error("embedded runtime has no reviewed bundled dependency to scan");
  }

  return {
    inventory: {
      schema_version: "noema.patch-validator-embedded-runtime-inventory.v1",
      validator_image_digest: validatorImageDigest,
      node_version: versions.node,
      process_versions: versions,
      ...(normalizedNodeBuildFeatures === undefined
        ? {}
        : { node_build_features: normalizedNodeBuildFeatures }),
      components,
    },
    scanPlan,
  };
}
