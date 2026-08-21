const OPENSSL_QUIC_LISTENER_CVE = "CVE-2026-14456";
const QUIC_DISABLED_REASON = "QUIC transport dependency disabled in this build";
const HTTP3_DISABLED_REASON = "HTTP/3 dependency disabled in this build";
const NON_APPLICABLE_REASON =
  "Node runtime proves QUIC and HTTP/3 dependencies are disabled";

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

function matchUsesExactReviewedCpe(match, component) {
  if (!isRecord(match) || !isRecord(match.vulnerability)) return false;
  if (match.vulnerability.id !== OPENSSL_QUIC_LISTENER_CVE) return false;

  const artifact = match.artifact;
  if (
    !isRecord(artifact)
    || artifact.name !== component.name
    || artifact.version !== component.version
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

/**
 * Apply narrowly reviewed applicability evidence without mutating the retained
 * raw scanner receipt. Only CVE-2026-14456 may be marked non-applicable, and
 * only when the exact runtime inventory proves Node was built without both
 * QUIC transport (ngtcp2) and HTTP/3 (nghttp3) dependencies. Every other
 * scanner match remains untouched for the strict verifier.
 */
export function applyReviewedEmbeddedRuntimeApplicability({ inventory, scan }) {
  const nonApplicableMatches = [];
  if (!isRecord(inventory) || !isRecord(scan) || !Array.isArray(scan.components)) {
    return { scan, nonApplicableMatches };
  }

  const quicDisabled =
    hasDisabledRuntimeMetadata(inventory, "ngtcp2", QUIC_DISABLED_REASON)
    && hasDisabledRuntimeMetadata(inventory, "nghttp3", HTTP3_DISABLED_REASON);
  if (!quicDisabled) {
    return { scan, nonApplicableMatches };
  }

  const openssl = opensslComponent(inventory);
  if (openssl === null) {
    return { scan, nonApplicableMatches };
  }

  let changed = false;
  const reviewedComponents = scan.components.map((rawComponentScan) => {
    if (
      !isRecord(rawComponentScan)
      || rawComponentScan.key !== "openssl"
      || rawComponentScan.identity !== openssl.cpe
      || !isRecord(rawComponentScan.scanner_output)
      || rawComponentScan.scanner_output.source?.type !== "cpe"
      || rawComponentScan.scanner_output.source?.target !== openssl.cpe
      || rawComponentScan.scanner_output.descriptor?.name !== "grype"
      || rawComponentScan.scanner_output.descriptor?.version !== "0.116.1"
      || !Array.isArray(rawComponentScan.scanner_output.matches)
    ) {
      return rawComponentScan;
    }

    const retainedMatches = [];
    for (const match of rawComponentScan.scanner_output.matches) {
      if (matchUsesExactReviewedCpe(match, openssl)) {
        changed = true;
        nonApplicableMatches.push({
          component_key: "openssl",
          vulnerability_id: OPENSSL_QUIC_LISTENER_CVE,
          reason: NON_APPLICABLE_REASON,
        });
      } else {
        retainedMatches.push(match);
      }
    }

    if (retainedMatches.length === rawComponentScan.scanner_output.matches.length) {
      return rawComponentScan;
    }
    return {
      ...rawComponentScan,
      scanner_output: {
        ...rawComponentScan.scanner_output,
        matches: retainedMatches,
      },
    };
  });

  if (!changed) {
    return { scan, nonApplicableMatches };
  }
  return {
    scan: { ...scan, components: reviewedComponents },
    nonApplicableMatches,
  };
}
