import {
  DISABLED_RUNTIME_METADATA_REASONS,
  RUNTIME_METADATA_REASONS,
  expectedIdentityForComponent,
} from "./patch-validator-embedded-runtime-catalog.mjs";

const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const GRYPE_PROVIDER_INPUT_DIGEST =
  /^(?:sha256:[0-9a-f]{64}|xxh64:[0-9a-f]{16})$/;
const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/;
const GRYPE_DATABASE_SCHEMA = /^v\d+\.\d+\.\d+$/;
const PROVIDER_NAME = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
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

function isCalendarValidRfc3339Timestamp(value) {
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] == null ? 0 : Number(match[9]);
  const offsetMinute = match[10] == null ? 0 : Number(match[10]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) {
    return false;
  }
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) && timestampMs <= Date.now();
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
  return expectedIdentityForComponent(component);
}

function expectedScannerSourceType(identity) {
  return identity.startsWith("pkg:") ? "purl" : "cpe";
}

function verifyGrypeDatabaseEvidence(descriptor, componentKey) {
  const database = requireRecord(
    descriptor.db,
    `embedded runtime component ${componentKey} vulnerability database evidence`,
  );
  const status = requireRecord(
    database.status,
    `embedded runtime component ${componentKey} database status evidence`,
  );
  requireCondition(
    GRYPE_DATABASE_SCHEMA.test(String(status.schemaVersion)),
    `embedded runtime component ${componentKey} database schema evidence is invalid`,
  );
  requireCondition(
    isCalendarValidRfc3339Timestamp(String(status.built)),
    `embedded runtime component ${componentKey} database build timestamp is invalid`,
  );
  requireCondition(
    status.valid === true,
    `embedded runtime component ${componentKey} vulnerability database must be valid`,
  );
  requireCondition(
    status.error == null || status.error === "",
    `embedded runtime component ${componentKey} vulnerability database error is not allowed`,
  );

  const providers = requireRecord(
    database.providers,
    `embedded runtime component ${componentKey} database providers evidence`,
  );
  const providerEntries = Object.entries(providers);
  requireCondition(
    providerEntries.length > 0 && providerEntries.length <= EMBEDDED_COMPONENT_LIMIT,
    `embedded runtime component ${componentKey} database providers evidence must be a bounded non-empty record`,
  );
  const normalizedProviders = [];
  for (const [providerName, rawProvider] of providerEntries) {
    requireCondition(
      PROVIDER_NAME.test(providerName),
      `embedded runtime component ${componentKey} database provider name is invalid`,
    );
    const provider = requireRecord(
      rawProvider,
      `embedded runtime component ${componentKey} database provider evidence`,
    );
    requireCondition(
      isCalendarValidRfc3339Timestamp(String(provider.captured)),
      `embedded runtime component ${componentKey} provider capture timestamp is invalid`,
    );
    requireCondition(
      GRYPE_PROVIDER_INPUT_DIGEST.test(String(provider.input)),
      `embedded runtime component ${componentKey} database provider input digest is invalid`,
    );
    normalizedProviders.push([
      providerName,
      {
        captured: provider.captured,
        input: provider.input,
      },
    ]);
  }
  normalizedProviders.sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({
    schema_version: status.schemaVersion,
    built_at: status.built,
    providers: normalizedProviders,
  });
}

function artifactCpeValue(candidate) {
  if (typeof candidate === "string") return candidate;
  const record = requireRecord(candidate, "embedded runtime match artifact CPE");
  return record.cpe;
}

function verifyEmbeddedMatchArtifact(match, component, expectedIdentity) {
  const artifact = requireRecord(
    match.artifact,
    `embedded runtime component ${component.key} match artifact`,
  );
  requireCondition(
    artifact.version === component.version,
    `embedded runtime component ${component.key} match artifact version does not match the reviewed component`,
  );
  if (artifact.name != null) {
    requireCondition(
      artifact.name === component.name,
      `embedded runtime component ${component.key} match artifact name does not match the reviewed component`,
    );
  }

  if (expectedIdentity.startsWith("pkg:")) {
    requireCondition(
      artifact.name === component.name && artifact.purl === expectedIdentity,
      `embedded runtime component ${component.key} match artifact identity does not match the reviewed PURL component`,
    );
    return;
  }

  requireCondition(
    Array.isArray(artifact.cpes) &&
      artifact.cpes.some((candidate) => artifactCpeValue(candidate) === expectedIdentity),
    `embedded runtime component ${component.key} match artifact identity does not match the reviewed CPE component`,
  );
}

function matchBindsReviewedScannerIdentity(match, expectedIdentity, componentKey) {
  if (expectedIdentity.startsWith("pkg:")) {
    return true;
  }

  requireCondition(
    Array.isArray(match.matchDetails),
    `embedded runtime component ${componentKey} CPE match details must be an array`,
  );
  for (const rawDetail of match.matchDetails) {
    const detail = requireRecord(
      rawDetail,
      `embedded runtime component ${componentKey} CPE match detail`,
    );
    const searchedBy = requireRecord(
      detail.searchedBy,
      `embedded runtime component ${componentKey} CPE search provenance`,
    );
    if (
      searchedBy.namespace === "nvd:cpe" &&
      Array.isArray(searchedBy.cpes) &&
      searchedBy.cpes.includes(expectedIdentity)
    ) {
      return true;
    }
  }
  return false;
}

function verifyEmbeddedScannerOutput(componentScan, expectedIdentity, component) {
  const componentKey = componentScan.key;
  const rawScanner = requireRecord(
    componentScan.scanner_output,
    `embedded runtime component ${componentKey} raw scanner evidence`,
  );
  requireCondition(
    componentScan.assessment == null &&
      componentScan.matches == null &&
      componentScan.ignoredMatches == null,
    `embedded runtime component ${componentKey} synthetic assessment fields are not allowed`,
  );
  const descriptor = requireRecord(
    rawScanner.descriptor,
    `embedded runtime component ${componentKey} raw scanner descriptor`,
  );
  requireCondition(
    descriptor.name === "grype",
    `embedded runtime component ${componentKey} raw scanner must be produced by Grype`,
  );
  requireCondition(
    descriptor.version === "0.116.1",
    `embedded runtime component ${componentKey} raw scanner version does not match`,
  );
  const source = requireRecord(
    rawScanner.source,
    `embedded runtime component ${componentKey} raw scanner source`,
  );
  requireCondition(
    source.type === expectedScannerSourceType(expectedIdentity),
    `embedded runtime component ${componentKey} raw scanner source type does not match`,
  );
  requireCondition(
    source.target === expectedIdentity,
    `embedded runtime component ${componentKey} raw scanner source target does not match`,
  );
  const databaseIdentity = verifyGrypeDatabaseEvidence(descriptor, componentKey);
  requireCondition(
    rawScanner.ignoredMatches == null ||
      (Array.isArray(rawScanner.ignoredMatches) &&
        rawScanner.ignoredMatches.length === 0),
    "ignored embedded runtime component matches are not allowed",
  );
  requireCondition(
    Array.isArray(rawScanner.matches),
    `embedded runtime component ${componentKey} matches must be an array`,
  );
  const identityBoundMatches = [];
  for (const rawMatch of rawScanner.matches) {
    const match = requireRecord(
      rawMatch,
      `embedded runtime component ${componentKey} match`,
    );
    verifyEmbeddedMatchArtifact(match, component, expectedIdentity);
    if (matchBindsReviewedScannerIdentity(match, expectedIdentity, componentKey)) {
      identityBoundMatches.push(match);
    }
  }
  const blocking = countBlockingMatches(
    identityBoundMatches,
    `embedded runtime component ${componentKey}`,
  );
  return {
    blocking,
    databaseIdentity,
    matchCount: rawScanner.matches.length,
  };
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

    const isDisabledMetadata =
      component.classification === "runtime_metadata" &&
      component.version === "" &&
      DISABLED_RUNTIME_METADATA_REASONS.has(component.key);
    requireCondition(
      typeof component.version === "string" &&
        (component.version.length > 0 || isDisabledMetadata) &&
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
      const expectedReason = isDisabledMetadata
        ? DISABLED_RUNTIME_METADATA_REASONS.get(component.key)
        : RUNTIME_METADATA_REASONS.get(component.key);
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
  let vulnerabilityDatabaseIdentity;
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
    const expectedComponent = scannableComponentByKey.get(componentScan.key);
    requireCondition(
      componentScan.identity === expectedComponent.identity,
      `embedded runtime component ${componentScan.key} scan identity does not match`,
    );
    const scannerResult = verifyEmbeddedScannerOutput(
      componentScan,
      expectedComponent.identity,
      expectedComponent.component,
    );
    if (vulnerabilityDatabaseIdentity === undefined) {
      vulnerabilityDatabaseIdentity = scannerResult.databaseIdentity;
    } else {
      requireCondition(
        scannerResult.databaseIdentity === vulnerabilityDatabaseIdentity,
        "embedded runtime component scans must use the same vulnerability database identity and provider snapshot",
      );
    }
    embeddedBlockingCount += scannerResult.blocking;
    embeddedMatchCount += scannerResult.matchCount;
  }
  requireCondition(
    scannedKeys.size === scannableComponentByKey.size,
    "embedded runtime vulnerability scan did not evaluate every component",
  );
  requireCondition(
    vulnerabilityDatabaseIdentity !== undefined,
    "embedded runtime vulnerability scan must retain a shared database identity",
  );
  requireCondition(
    embeddedBlockingCount === 0,
    "blocking embedded runtime vulnerabilities are not allowed",
  );

  return {
    embedded_runtime_component_count: inventory.components.length,
    embedded_runtime_vulnerability_match_count: embeddedMatchCount,
    embedded_runtime_vulnerability_database_identity: vulnerabilityDatabaseIdentity,
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
 * ABI/data-only and explicitly disabled feature versions remain in that
 * exhaustive inventory as reviewed runtime metadata, while every active bundled
 * dependency must carry exactly one version-bound identity from the shared
 * repository-owned catalog. The catalog admits only explicitly reviewed npm or
 * GitHub PURLs and NVD-aligned application CPEs. Each dependency is accepted
 * only when raw Grype JSON names the pinned scanner, binds the exact reviewed
 * PURL or CPE as its source target, carries the same vulnerability-database and
 * provider snapshot as every sibling scan, and binds every reported match to
 * the exact reviewed artifact identity. Synthetic completion flags, generic
 * PURLs, unknown identities, omitted components, ignored matches, malformed
 * database provenance, cross-package matches, and medium-or-higher or
 * unknown-severity advisories fail closed.
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
