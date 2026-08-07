const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const EXPECTED_NODE_VERSION = "24.19.0";
const EXPECTED_NODE_CPE =
  `cpe:2.3:a:nodejs:node.js:${EXPECTED_NODE_VERSION}:*:*:*:*:*:*:*`;
const BLOCKING_SEVERITIES = new Set(["MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);
const ALLOWED_SEVERITIES = new Set([
  "NEGLIGIBLE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "UNKNOWN",
]);

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

/**
 * Verify that the self-compiled Node runtime is actually present in a binary
 * inventory and that an independent image vulnerability scanner evaluated the
 * same immutable local image without suppressing findings.
 *
 * Trivy remains the primary package-manager/dependency scanner, but its OS
 * package scanner cannot authenticate a self-compiled binary that has no
 * distribution package metadata. This verifier therefore fail-closes unless
 * Syft identifies the exact Node 24.19.0 executable with its exact Node.js CPE
 * and Grype reports on the same Docker image ID. Unknown severities are blocked
 * as well as medium, high, and critical findings so an unclassified match
 * cannot silently become release evidence.
 *
 * Syft JSON represents CPEs as objects in current releases, while older or
 * normalized fixtures may expose strings. Both serializations are accepted,
 * but only the one exact Node.js CPE is valid.
 */
export function verifyStaticRuntimeBinaryEvidence({
  binarySbom,
  binaryVulnerabilityScan,
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

  let blockingMatchCount = 0;
  for (const rawMatch of grype.matches) {
    const match = requireRecord(rawMatch, "Grype match");
    const vulnerability = requireRecord(
      match.vulnerability,
      "Grype vulnerability",
    );
    const severity = normalizedSeverity(vulnerability.severity);
    if (BLOCKING_SEVERITIES.has(severity)) {
      blockingMatchCount += 1;
    }
  }
  requireCondition(
    blockingMatchCount === 0,
    "blocking static-runtime vulnerabilities are not allowed",
  );

  return {
    binary_cataloger: "syft@1.50.0",
    binary_vulnerability_scanner: "grype@0.116.1",
    node_runtime_version: EXPECTED_NODE_VERSION,
    binary_package_count: syft.artifacts.length,
    binary_vulnerability_match_count: grype.matches.length,
    blocked_binary_vulnerability_count: blockingMatchCount,
  };
}
