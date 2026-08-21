const OPENSSL_QUIC_LISTENER_CVE = "CVE-2026-14456";
const NGHTTPX_REQUEST_SMUGGLING_CVE = "CVE-2026-58055";
const LEGACY_V8_CVES = new Set([
  "CVE-2015-5380",
  "CVE-2011-5037",
  "CVE-2011-3886",
]);
const QUIC_DISABLED_REASON = "QUIC transport dependency disabled in this build";
const HTTP3_DISABLED_REASON = "HTTP/3 dependency disabled in this build";
const OPENSSL_NON_APPLICABLE_REASON =
  "Node runtime proves QUIC and HTTP/3 dependencies are disabled";
const NGHTTP2_NON_APPLICABLE_REASON =
  "CVE affects the nghttpx proxy, not Node's embedded libnghttp2 runtime";
const V8_NON_APPLICABLE_REASON =
  "Exact Node 24.19.0 V8 runtime is newer than the reviewed affected legacy V8 releases";
const EXPECTED_NODE_VERSION = "24.19.0";
const EXPECTED_NGHTTP2_VERSION = "1.69.0";
const EXPECTED_NGHTTP2_CPE =
  "cpe:2.3:a:nghttp2:nghttp2:1.69.0:*:*:*:*:*:*:*";
const EXPECTED_V8_VERSION = "13.6.233.17-node.51";
const EXPECTED_V8_SCANNER_VERSION = "13.6.233.17";
const EXPECTED_V8_CPE =
  "cpe:2.3:a:google:v8:13.6.233.17:*:*:*:*:*:*:*";

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function cpeValue(value) {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.cpe === "string") return value.cpe;
  return null;
}

function hasDisabledRuntimeMetadata(inventory, key, reason) {
  if (!isRecord(inventory.process_versions) || inventory.process_versions[key] !== "") {
    return false;
  }
  if (!Array.isArray(inventory.components)) return false;
  const matching = inventory.components.filter(
    (component) =>
      isRecord(component)
      && component.key === key
      && component.name === key
      && component.version === ""
      && component.classification === "runtime_metadata"
      && component.reason === reason
      && component.cpe == null
      && component.purl == null,
  );
  return matching.length === 1;
}

function exactBundledCpeComponent(inventory, key, name, version, cpe) {
  if (!Array.isArray(inventory.components)) return null;
  const matching = inventory.components.filter(
    (component) =>
      isRecord(component)
      && component.key === key
      && component.name === name
      && component.version === version
      && component.classification === "bundled_dependency"
      && component.cpe === cpe
      && component.purl == null,
  );
  return matching.length === 1 ? matching[0] : null;
}

function opensslComponent(inventory) {
  if (!Array.isArray(inventory.components)) return null;
  const matching = inventory.components.filter(
    (component) =>
      isRecord(component)
      && component.key === "openssl"
      && component.name === "openssl"
      && typeof component.version === "string"
      && component.version.length > 0
      && component.classification === "bundled_dependency"
      && typeof component.cpe === "string"
      && component.purl == null,
  );
  return matching.length === 1 ? matching[0] : null;
}

function matchUsesExactReviewedCpe(
  match,
  component,
  vulnerabilityId,
  expectedArtifactVersion = component.version,
) {
  if (!isRecord(match) || !isRecord(match.vulnerability)) return false;
  if (match.vulnerability.id !== vulnerabilityId) return false;

  const artifact = match.artifact;
  if (
    !isRecord(artifact)
    || artifact.name !== component.name
    || artifact.version !== expectedArtifactVersion
    || !Array.isArray(artifact.cpes)
    || !artifact.cpes.some((value) => cpeValue(value) === component.cpe)
  ) {
    return false;
  }

  if (!Array.isArray(match.matchDetails)) return false;
  return match.matchDetails.some((detail) => {
    if (!isRecord(detail) || !isRecord(detail.searchedBy)) return false;
    return (
      detail.searchedBy.namespace === "nvd:cpe"
      && Array.isArray(detail.searchedBy.cpes)
      && detail.searchedBy.cpes.includes(component.cpe)
    );
  });
}

function scanMatchesExactComponent(rawComponentScan, component) {
  return (
    isRecord(rawComponentScan)
    && rawComponentScan.key === component.key
    && rawComponentScan.identity === component.cpe
    && isRecord(rawComponentScan.scanner_output)
    && rawComponentScan.scanner_output.source?.type === "cpe"
    && rawComponentScan.scanner_output.source?.target === component.cpe
    && rawComponentScan.scanner_output.descriptor?.name === "grype"
    && rawComponentScan.scanner_output.descriptor?.version === "0.116.1"
    && Array.isArray(rawComponentScan.scanner_output.matches)
  );
}

function filterReviewedMatches(
  rawComponentScan,
  component,
  reviewedVulnerabilityIds,
  reason,
  nonApplicableMatches,
  expectedArtifactVersion = component?.version,
) {
  if (component === null || !scanMatchesExactComponent(rawComponentScan, component)) {
    return { componentScan: rawComponentScan, changed: false };
  }

  const retainedMatches = [];
  let changed = false;
  for (const match of rawComponentScan.scanner_output.matches) {
    const vulnerabilityId = isRecord(match?.vulnerability)
      ? match.vulnerability.id
      : null;
    if (
      typeof vulnerabilityId === "string"
      && reviewedVulnerabilityIds.has(vulnerabilityId)
      && matchUsesExactReviewedCpe(
        match,
        component,
        vulnerabilityId,
        expectedArtifactVersion,
      )
    ) {
      changed = true;
      nonApplicableMatches.push({
        component_key: component.key,
        vulnerability_id: vulnerabilityId,
        reason,
      });
    } else {
      retainedMatches.push(match);
    }
  }

  if (!changed) {
    return { componentScan: rawComponentScan, changed: false };
  }
  return {
    componentScan: {
      ...rawComponentScan,
      scanner_output: {
        ...rawComponentScan.scanner_output,
        matches: retainedMatches,
      },
    },
    changed: true,
  };
}

/**
 * Apply narrowly reviewed applicability evidence without mutating the retained
 * raw scanner receipt. Exceptions are exact-CVE, exact-component, exact-CPE,
 * Grype-0.116.1 NVD-CPE matches only:
 *
 * - OpenSSL CVE-2026-14456 requires exact evidence that both QUIC transport
 *   dependencies are disabled in this Node build.
 * - nghttp2 CVE-2026-58055 describes the nghttpx proxy request-forwarding
 *   behavior; the exact Node 24.19.0 runtime inventories libnghttp2 as a
 *   statically bundled dependency, not the nghttpx proxy executable.
 * - the three legacy V8 advisories are bounded to historical affected V8/Node
 *   releases that predate the exact Node 24.19.0 / V8 13.6.233.17-node.51
 *   runtime retained in the inventory. Grype reports the normalized CPE
 *   artifact version 13.6.233.17, which is accepted only for this exact
 *   reviewed runtime/CPE pairing.
 *
 * Every other scanner match remains untouched for the strict verifier.
 */
export function applyReviewedEmbeddedRuntimeApplicability({ inventory, scan }) {
  const nonApplicableMatches = [];
  if (!isRecord(inventory) || !isRecord(scan) || !Array.isArray(scan.components)) {
    return { scan, nonApplicableMatches };
  }

  const quicDisabled =
    hasDisabledRuntimeMetadata(inventory, "ngtcp2", QUIC_DISABLED_REASON)
    && hasDisabledRuntimeMetadata(inventory, "nghttp3", HTTP3_DISABLED_REASON);
  const openssl = quicDisabled ? opensslComponent(inventory) : null;

  const exactNodeRuntime =
    inventory.node_version === EXPECTED_NODE_VERSION
    && isRecord(inventory.process_versions)
    && inventory.process_versions.node === EXPECTED_NODE_VERSION;
  const nghttp2 = exactNodeRuntime
    && inventory.process_versions.nghttp2 === EXPECTED_NGHTTP2_VERSION
    ? exactBundledCpeComponent(
        inventory,
        "nghttp2",
        "nghttp2",
        EXPECTED_NGHTTP2_VERSION,
        EXPECTED_NGHTTP2_CPE,
      )
    : null;
  const v8 = exactNodeRuntime
    && inventory.process_versions.v8 === EXPECTED_V8_VERSION
    ? exactBundledCpeComponent(
        inventory,
        "v8",
        "v8",
        EXPECTED_V8_VERSION,
        EXPECTED_V8_CPE,
      )
    : null;

  let changed = false;
  const reviewedComponents = scan.components.map((rawComponentScan) => {
    let current = rawComponentScan;

    const opensslResult = filterReviewedMatches(
      current,
      openssl,
      new Set([OPENSSL_QUIC_LISTENER_CVE]),
      OPENSSL_NON_APPLICABLE_REASON,
      nonApplicableMatches,
    );
    current = opensslResult.componentScan;
    changed ||= opensslResult.changed;

    const nghttp2Result = filterReviewedMatches(
      current,
      nghttp2,
      new Set([NGHTTPX_REQUEST_SMUGGLING_CVE]),
      NGHTTP2_NON_APPLICABLE_REASON,
      nonApplicableMatches,
    );
    current = nghttp2Result.componentScan;
    changed ||= nghttp2Result.changed;

    const v8Result = filterReviewedMatches(
      current,
      v8,
      LEGACY_V8_CVES,
      V8_NON_APPLICABLE_REASON,
      nonApplicableMatches,
      EXPECTED_V8_SCANNER_VERSION,
    );
    current = v8Result.componentScan;
    changed ||= v8Result.changed;

    return current;
  });

  if (!changed) {
    return { scan, nonApplicableMatches };
  }
  return {
    scan: { ...scan, components: reviewedComponents },
    nonApplicableMatches,
  };
}
