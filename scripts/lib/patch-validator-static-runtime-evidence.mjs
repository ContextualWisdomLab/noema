const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const EXPECTED_NODE_VERSION = "24.19.0";
const EXPECTED_NODE_CPE =
  `cpe:2.3:a:nodejs:node.js:${EXPECTED_NODE_VERSION}:*:*:*:*:*:*:*`;
const EMBEDDED_INVENTORY_SCHEMA =
  "noema.patch-validator-embedded-runtime-inventory.v1";
const EMBEDDED_SCAN_SCHEMA =
  "noema.patch-validator-embedded-runtime-vulnerability-scan.v1";
const EMBEDDED_COMPONENT_LIMIT = 128;
const COMPONENT_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const BLOCKING_SEVERITIES = new Set(["MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);
const ALLOWED_SEVERITIES = new Set([
  "NEGLIGIBLE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "UNKNOWN",
]);
const RUNTIME_METADATA_REASONS = new Map([
  ["modules", "Node.js native module ABI version"],
  ["napi", "Node-API compatibility level"],
]);
const NGTCP2_FIXED_VERSION = "1.22.1";
const NGTCP2_FIXED_VERSION_PARTS = [1n, 22n, 1n];

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

function normalizedSeverity(value) {
  requireCondition(
    typeof value === "string",
    "binary vulnerability severity must be a string",
  );
  const severity = value.toUpperCase();
  requireCondition(
    ALLOWED_SEVERITIES.has(severity),
    "binary vulnerability severity is unsupported",
  );
  return severity;
}

function countBlockingMatches(matches, label) {
  requireCondition(Array.isArray(matches), `${label} matches must be an array`);
  let blocking = 0;
  for (const rawMatch of matches) {
    const match = requireRecord(rawMatch, `${label} match`);
    const vulnerability = requireRecord(
      match.vulnerability,
      `${label} vulnerability`,
    );
    if (BLOCKING_SEVERITIES.has(normalizedSeverity(vulnerability.severity))) {
      blocking += 1;
    }
  }
  return blocking;
}

function imageIdFromSyftSource(source) {
  const metadata = requireRecord(source.metadata, "Syft source metadata");
  return metadata.imageID ?? metadata.imageId ?? null;
}

function packageHasNodeBinaryLocation(pkg) {
  return (
    Array.isArray(pkg.locations) &&
    pkg.locations.some((location) => {
      const record = requireRecord(location, "Syft package location");
      return (
        record.path === "/nodejs/bin/node" ||
        record.accessPath === "/nodejs/bin/node"
      );
    })
  );
}

function packageHasNodeCpe(pkg) {
  return (
    Array.isArray(pkg.cpes) &&
    pkg.cpes.some((candidate) => {
      if (typeof candidate === "string") {
        return candidate === EXPECTED_NODE_CPE;
      }
      const record = requireRecord(candidate, "Syft package CPE");
      return record.cpe === EXPECTED_NODE_CPE;
    })
  );
}

function componentIdentity(component) {
  const cpe = component.cpe;
  const purl = component.purl;
  const hasCpe =
    typeof cpe === "string" &&
    cpe.length <= 512 &&
    cpe.startsWith("cpe:2.3:a:");
  const hasPurl =
    typeof purl === "string" &&
    purl.length <= 512 &&
    purl.startsWith("pkg:");
  requireCondition(
    hasCpe || hasPurl,
    `embedded runtime component ${String(component.key)} has no supported vulnerability identity`,
  );
  return hasPurl ? purl : cpe;
}

/**
 * Return true only for stable numeric ngtcp2 releases at or above the reviewed
 * CVE-2026-40170 fixed floor. Scanner-negative evidence is not sufficient for
 * this component because the vendored native dependency can lack a reliable
 * ecosystem/CPE match. Ambiguous pre-release or non-numeric versions therefore
 * fail closed instead of being interpreted as newer than the fixed release.
 */
function ngtcp2MeetsSecurityFloor(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return false;
  }
  const candidate = match.slice(1).map((part) => BigInt(part));
  for (let index = 0; index < NGTCP2_FIXED_VERSION_PARTS.length; index += 1) {
    if (candidate[index] > NGTCP2_FIXED_VERSION_PARTS[index]) {
      return true;
    }
    if (candidate[index] < NGTCP2_FIXED_VERSION_PARTS[index]) {
      return false;
    }
  }
  return true;
}

function verifyEmbeddedRuntimeEvidence({
  embeddedRuntimeInventory,
  embeddedVulnerabilityScan,
  expectedImageDigest,
}) {
  const inventory = requireRecord(
    embeddedRuntimeInventory,
    "embedded runtime inventory",
  );
  requireCondition(
    inventory.schema_version === EMBEDDED_INVENTORY_SCHEMA,
    "embedded runtime inventory schema does not match",
  );
  requireCondition(
    inventory.validator_image_digest === expectedImageDigest,
    "embedded runtime inventory image digest does not match",
  );
  requireCondition(
    inventory.node_version === EXPECTED_NODE_VERSION,
    "embedded runtime inventory Node version does not match",
  );
  requireCondition(
    Array.isArray(inventory.components) &&
      inventory.components.length > 0 &&
      inventory.components.length <= EMBEDDED_COMPONENT_LIMIT,
    "embedded runtime inventory components must be a bounded non-empty array",
  );

  const scan = requireRecord(
    embeddedVulnerabilityScan,
    "embedded runtime vulnerability scan",
  );
  requireCondition(
    scan.schema_version === EMBEDDED_SCAN_SCHEMA,
    "embedded runtime vulnerability scan schema does not match",
  );
  requireCondition(
    scan.validator_image_digest === expectedImageDigest,
    "embedded runtime vulnerability scan image digest does not match",
  );
  requireCondition(
    scan.scanner === "grype@0.116.1",
    "embedded runtime vulnerability scanner does not match",
  );
  requireCondition(
    scan.ignoredMatches == null ||
      (Array.isArray(scan.ignoredMatches) && scan.ignoredMatches.length === 0),
    "ignored embedded runtime vulnerability matches are not allowed",
  );

  // Older RED fixtures used one aggregate match list. Inspect it first so a
  // known blocking advisory can never become non-blocking merely because newer
  // completeness fields are absent. Clean aggregate-only evidence is still
  // rejected below because per-component scan evidence is mandatory.
  if (Array.isArray(scan.matches)) {
    const aggregateBlocking = countBlockingMatches(
      scan.matches,
      "embedded runtime vulnerability scan",
    );
    requireCondition(
      aggregateBlocking === 0,
      "blocking embedded runtime vulnerabilities are not allowed",
    );
  }

  const processVersions = requireRecord(
    inventory.process_versions,
    "embedded runtime process.versions",
  );
  requireCondition(
    processVersions.node === EXPECTED_NODE_VERSION,
    "embedded runtime process.versions Node version does not match",
  );
  const expectedKeys = Object.keys(processVersions)
    .filter((key) => key !== "node")
    .sort();
  requireCondition(
    expectedKeys.length > 0 && expectedKeys.length <= EMBEDDED_COMPONENT_LIMIT,
    "embedded runtime process.versions dependencies must be a bounded non-empty set",
  );

  const componentByKey = new Map();
  const scannableComponentByKey = new Map();
  for (const rawComponent of inventory.components) {
    const component = requireRecord(rawComponent, "embedded runtime component");
    requireCondition(
      typeof component.key === "string" && COMPONENT_KEY.test(component.key),
      "embedded runtime component key is invalid",
    );
    requireCondition(
      !componentByKey.has(component.key),
      "embedded runtime component keys must be unique",
    );
    requireCondition(
      typeof component.name === "string" &&
        component.name.length > 0 &&
        component.name.length <= 128,
      `embedded runtime component ${component.key} name is invalid`,
    );
    requireCondition(
      typeof component.version === "string" &&
        component.version.length > 0 &&
        component.version.length <= 128 &&
        processVersions[component.key] === component.version,
      `embedded runtime component ${component.key} version does not match process.versions`,
    );

    let identity = null;
    if (component.classification === "bundled_dependency") {
      identity = componentIdentity(component);
      if (component.key === "ngtcp2") {
        requireCondition(
          ngtcp2MeetsSecurityFloor(component.version),
          `known vulnerable embedded runtime dependency ngtcp2 ${component.version}; CVE-2026-40170 is fixed in ${NGTCP2_FIXED_VERSION}`,
        );
      }
      scannableComponentByKey.set(component.key, { identity, component });
    } else {
      requireCondition(
        component.classification === "runtime_metadata",
        `embedded runtime component ${component.key} must be classified as a bundled dependency or approved runtime metadata`,
      );
      const expectedReason = RUNTIME_METADATA_REASONS.get(component.key);
      requireCondition(
        expectedReason !== undefined,
        `embedded runtime component ${component.key} runtime metadata classification is not allowed`,
      );
      requireCondition(
        component.reason === expectedReason,
        `embedded runtime component ${component.key} runtime metadata reason does not match`,
      );
      requireCondition(
        component.cpe == null && component.purl == null,
        `embedded runtime component ${component.key} runtime metadata must not declare a vulnerability identity`,
      );
    }
    componentByKey.set(component.key, { identity, component });
  }

  const actualKeys = [...componentByKey.keys()].sort();
  requireCondition(
    actualKeys.length === expectedKeys.length &&
      actualKeys.every((key, index) => key === expectedKeys[index]),
    "embedded runtime component set must exactly match process.versions dependencies",
  );

  requireCondition(
    Array.isArray(scan.components) &&
      scan.components.length === scannableComponentByKey.size,
    "embedded runtime vulnerability scan must contain one result per component; one result per bundled dependency is required",
  );
  const scannedKeys = new Set();
  let embeddedMatchCount = 0;
  let embeddedBlockingCount = 0;
  for (const rawComponentScan of scan.components) {
    const componentScan = requireRecord(
      rawComponentScan,
      "embedded runtime component scan",
    );
    requireCondition(
      typeof componentScan.key === "string" &&
        scannableComponentByKey.has(componentScan.key),
      "embedded runtime component scan references an unknown component",
    );
    requireCondition(
      !scannedKeys.has(componentScan.key),
      "embedded runtime component scan keys must be unique",
    );
    scannedKeys.add(componentScan.key);
    const expectedIdentity = scannableComponentByKey.get(componentScan.key).identity;
    requireCondition(
      componentScan.identity === expectedIdentity,
      `embedded runtime component ${componentScan.key} scan identity does not match`,
    );
    requireCondition(
      componentScan.ignoredMatches == null ||
        (Array.isArray(componentScan.ignoredMatches) &&
          componentScan.ignoredMatches.length === 0),
      "ignored embedded runtime component matches are not allowed",
    );
    const assessment = requireRecord(
      componentScan.assessment,
      `embedded runtime component ${componentScan.key} positive scanner assessment evidence`,
    );
    requireCondition(
      assessment.status === "completed",
      `embedded runtime component ${componentScan.key} positive scanner assessment evidence must be completed`,
    );
    requireCondition(
      assessment.scanner === "grype@0.116.1",
      `embedded runtime component ${componentScan.key} positive scanner assessment evidence scanner does not match`,
    );
    requireCondition(
      assessment.identity === expectedIdentity,
      `embedded runtime component ${componentScan.key} positive scanner assessment evidence identity does not match`,
    );
    const blocking = countBlockingMatches(
      componentScan.matches,
      `embedded runtime component ${componentScan.key}`,
    );
    embeddedBlockingCount += blocking;
    embeddedMatchCount += componentScan.matches.length;
  }
  requireCondition(
    scannedKeys.size === scannableComponentByKey.size,
    "embedded runtime vulnerability scan did not evaluate every component",
  );
  requireCondition(
    embeddedBlockingCount === 0,
    "blocking embedded runtime vulnerabilities are not allowed",
  );

  return {
    embedded_runtime_component_count: inventory.components.length,
    embedded_runtime_vulnerability_match_count: embeddedMatchCount,
    blocked_embedded_runtime_vulnerability_count: embeddedBlockingCount,
  };
}

/**
 * Verify the self-compiled static Node runtime and every dependency exposed by
 * that runtime's exact `process.versions` record before accepting vulnerability
 * evidence for the immutable image.
 *
 * Syft/Grype image scanning authenticates the Node executable itself. A fully
 * static Node build also bundles native dependencies into that executable, so
 * the verifier separately requires an exact-image-bound dependency inventory
 * whose component set equals `process.versions` (excluding Node itself).
 * `modules` and `napi` remain in that exhaustive inventory as reviewed ABI
 * metadata, while every actual bundled dependency must carry a CPE or PURL and
 * positive, exact-identity-bound Grype assessment evidence even when the
 * scanner reports zero matches. Known advisory floors cover scanner identity
 * gaps; unknown identities, omitted components, ignored matches, missing
 * positive assessments, and medium-or-higher or unknown-severity advisories
 * fail closed. This prevents a clean Node-only CPE result, an empty fabricated
 * component result, or a scanner blind spot from being mistaken for complete
 * static-runtime evidence without fabricating package identities for ABI
 * counters.
 */
export function verifyStaticRuntimeBinaryEvidence({
  binarySbom,
  binaryVulnerabilityScan,
  embeddedRuntimeInventory,
  embeddedVulnerabilityScan,
  expectedImageDigest,
}) {
  requireCondition(
    IMAGE_DIGEST.test(String(expectedImageDigest)),
    "expected static-runtime image digest is invalid",
  );

  const syft = requireRecord(binarySbom, "Syft SBOM record");
  const syftDescriptor = requireRecord(syft.descriptor, "Syft descriptor");
  requireCondition(
    syftDescriptor.name === "syft",
    "binary SBOM must be produced by Syft",
  );
  requireCondition(
    syftDescriptor.version === "1.50.0",
    "binary SBOM Syft version does not match",
  );
  const syftSource = requireRecord(syft.source, "Syft source");
  requireCondition(syftSource.type === "image", "Syft source must be an image");
  requireCondition(
    imageIdFromSyftSource(syftSource) === expectedImageDigest,
    "Syft image digest does not match",
  );
  requireCondition(
    Array.isArray(syft.artifacts),
    "Syft artifacts must be an array",
  );

  const nodePackages = syft.artifacts.filter((rawPackage) => {
    const pkg = requireRecord(rawPackage, "Syft package");
    return (
      pkg.name === "node" &&
      pkg.version === EXPECTED_NODE_VERSION &&
      packageHasNodeBinaryLocation(pkg) &&
      packageHasNodeCpe(pkg)
    );
  });
  requireCondition(
    nodePackages.length === 1,
    "Syft must identify exactly one expected static Node runtime",
  );

  const grype = requireRecord(
    binaryVulnerabilityScan,
    "Grype vulnerability record",
  );
  const grypeDescriptor = requireRecord(grype.descriptor, "Grype descriptor");
  requireCondition(
    grypeDescriptor.name === "grype",
    "binary scan must be produced by Grype",
  );
  requireCondition(
    grypeDescriptor.version === "0.116.1",
    "binary scan Grype version does not match",
  );
  const grypeSource = requireRecord(grype.source, "Grype source");
  requireCondition(
    grypeSource.type === "image",
    "Grype source must be an image",
  );
  const grypeTarget = requireRecord(
    grypeSource.target,
    "Grype image target",
  );
  requireCondition(
    grypeTarget.imageID === expectedImageDigest,
    "Grype image digest does not match",
  );
  requireCondition(
    Array.isArray(grype.matches),
    "Grype matches must be an array",
  );
  requireCondition(
    grype.ignoredMatches == null ||
      (Array.isArray(grype.ignoredMatches) &&
        grype.ignoredMatches.length === 0),
    "ignored binary vulnerability matches are not allowed",
  );

  const blockingMatchCount = countBlockingMatches(grype.matches, "Grype");
  requireCondition(
    blockingMatchCount === 0,
    "blocking static-runtime vulnerabilities are not allowed",
  );

  const embedded = verifyEmbeddedRuntimeEvidence({
    embeddedRuntimeInventory,
    embeddedVulnerabilityScan,
    expectedImageDigest,
  });

  return {
    binary_cataloger: "syft@1.50.0",
    binary_vulnerability_scanner: "grype@0.116.1",
    node_runtime_version: EXPECTED_NODE_VERSION,
    binary_package_count: syft.artifacts.length,
    binary_vulnerability_match_count: grype.matches.length,
    blocked_binary_vulnerability_count: blockingMatchCount,
    ...embedded,
  };
}
