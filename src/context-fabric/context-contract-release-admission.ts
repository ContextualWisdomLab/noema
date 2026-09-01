/** Contract capabilities Noema requires before Context Graph becomes a production dependency. */
export const REQUIRED_CONTEXT_CONTRACT_CAPABILITIES = Object.freeze([
  "canonical-object-reference",
  "canonical-authority-reference",
  "truth-status-origin",
  "bitemporal-valid-system-time",
  "provenance",
  "context-assertion",
  "cloudevent-envelope",
  "context-assertion-event-semantics",
  "schema-conformance",
  "admission-receipt",
] as const);

const CONTEXT_CONTRACT_REPOSITORY = "ContextualWisdomLab/context-graph-contracts";
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TRUSTED_RELEASE_FIELDS = Object.freeze([
  "repository",
  "publicationState",
  "releaseVersion",
  "releaseRef",
  "sourceCommit",
  "provenanceSourceCommit",
  "packageSha256",
  "sbomSha256",
  "provenanceSha256",
  "conformance",
  "admission",
  "compatibility",
  "migration",
  "licensing",
  "notice",
] as const);

/** Immutable publication evidence claimed by a candidate Context Graph contract. */
export interface ContextContractReleaseEvidence {
  repository: string;
  publicationState: string;
  releaseVersion: string;
  releaseRef: string;
  sourceCommit: string;
  provenanceSourceCommit: string;
  packageSha256: string;
  sbomSha256: string;
  provenanceSha256: string;
  conformance: string;
  admission: string;
  compatibility: string;
  migration: string;
  licensing: string;
  notice: string;
  capabilities: string[];
}

/** Trusted lookup boundary used to authenticate one immutable Context Graph release identity. */
export interface ContextContractReleaseAuthority {
  resolveRelease(
    repository: string,
    releaseRef: string,
  ): Readonly<ContextContractReleaseEvidence> | null;
}

/** Raised when candidate Context Graph release evidence cannot be trusted by Noema. */
export class ContextContractReleaseAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextContractReleaseAdmissionError";
  }
}

function reject(message: string): never {
  throw new ContextContractReleaseAdmissionError(message);
}

function requireExactString(value: unknown, expected: string, label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (value !== expected) reject(`${label} must equal ${expected}`);
  return value;
}

function requireOneOf(value: unknown, expected: readonly string[], label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (!expected.includes(value)) reject(`${label} is not an accepted release state`);
  return value;
}

function requirePattern(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (!pattern.test(value)) reject(`${label} is not canonical`);
  return value;
}

function releaseAuthorityKey(repository: string, releaseRef: string): string {
  return `${repository}\u0000${releaseRef}`;
}

/**
 * Validate the shape and internal consistency of claimed release metadata.
 *
 * This function deliberately does not grant production authority. It only creates a detached,
 * immutable snapshot after checking canonical repository/ref/hash/conformance and release-promotion
 * fields. A caller can still fabricate all of those values, so production admission must independently
 * authenticate the release against a trusted registry/signature/provenance authority.
 */
export function validateContextContractReleaseEvidence(
  candidate: ContextContractReleaseEvidence,
): Readonly<ContextContractReleaseEvidence> {
  const {
    repository: rawRepository,
    publicationState: rawPublicationState,
    releaseVersion: rawReleaseVersion,
    releaseRef: rawReleaseRef,
    sourceCommit: rawSourceCommit,
    provenanceSourceCommit: rawProvenanceSourceCommit,
    packageSha256: rawPackageSha256,
    sbomSha256: rawSbomSha256,
    provenanceSha256: rawProvenanceSha256,
    conformance: rawConformance,
    admission: rawAdmission,
    compatibility: rawCompatibility,
    migration: rawMigration,
    licensing: rawLicensing,
    notice: rawNotice,
    capabilities: rawCapabilities,
  } = candidate;

  const repository = requireExactString(rawRepository, CONTEXT_CONTRACT_REPOSITORY, "repository");
  const publicationState = requireExactString(rawPublicationState, "released", "publicationState");
  const releaseVersion = requirePattern(rawReleaseVersion, SEMVER_PATTERN, "releaseVersion");
  const releaseRef = requirePattern(rawReleaseRef, /^refs\/tags\/[!-~]+$/u, "releaseRef");
  const versionTag = `refs/tags/v${releaseVersion}`;
  const plainTag = `refs/tags/${releaseVersion}`;
  if (releaseRef !== versionTag && releaseRef !== plainTag) {
    reject("releaseRef must bind the exact releaseVersion tag");
  }

  const sourceCommit = requirePattern(rawSourceCommit, COMMIT_PATTERN, "sourceCommit");
  const provenanceSourceCommit = requirePattern(
    rawProvenanceSourceCommit,
    COMMIT_PATTERN,
    "provenanceSourceCommit",
  );
  if (provenanceSourceCommit !== sourceCommit) {
    reject("provenanceSourceCommit must equal sourceCommit");
  }

  const packageSha256 = requirePattern(rawPackageSha256, SHA256_PATTERN, "packageSha256");
  const sbomSha256 = requirePattern(rawSbomSha256, SHA256_PATTERN, "sbomSha256");
  const provenanceSha256 = requirePattern(rawProvenanceSha256, SHA256_PATTERN, "provenanceSha256");
  const conformance = requireExactString(rawConformance, "passed", "conformance");
  const admission = requireExactString(rawAdmission, "passed", "admission");
  const compatibility = requireExactString(rawCompatibility, "passed", "compatibility");
  const migration = requireOneOf(rawMigration, ["passed", "not-required"], "migration");
  const licensing = requireExactString(rawLicensing, "passed", "licensing");
  const notice = requireOneOf(rawNotice, ["passed", "not-required"], "notice");

  if (!Array.isArray(rawCapabilities)) reject("capabilities must be an array");
  const capabilities: string[] = [];
  for (const capability of rawCapabilities) {
    if (typeof capability !== "string") reject("capabilities must contain only strings");
    capabilities.push(capability);
  }

  const capabilitySet = new Set(capabilities);
  if (capabilitySet.size !== capabilities.length) reject("capabilities must not contain duplicates");
  for (const requiredCapability of REQUIRED_CONTEXT_CONTRACT_CAPABILITIES) {
    if (!capabilitySet.has(requiredCapability)) {
      reject(`missing required capability: ${requiredCapability}`);
    }
  }

  const admittedCapabilities = Object.freeze([...capabilities]);
  return Object.freeze({
    repository,
    publicationState,
    releaseVersion,
    releaseRef,
    sourceCommit,
    provenanceSourceCommit,
    packageSha256,
    sbomSha256,
    provenanceSha256,
    conformance,
    admission,
    compatibility,
    migration,
    licensing,
    notice,
    capabilities: admittedCapabilities as string[],
  });
}

/**
 * Immutable in-process release registry populated only from an operator-controlled trust anchor.
 *
 * The adapter does not discover releases and must never be populated from the same untrusted
 * candidate being admitted. Its job is to pin exact producer release identities obtained from a
 * separately authenticated publication/provenance path, then make those pins queryable by Noema's
 * admission boundary without importing Context Graph implementation code.
 */
export class PinnedContextContractReleaseAuthority implements ContextContractReleaseAuthority {
  private readonly releases: ReadonlyMap<string, Readonly<ContextContractReleaseEvidence>>;

  constructor(releases: readonly ContextContractReleaseEvidence[]) {
    const trustedPins = new Map<string, Readonly<ContextContractReleaseEvidence>>();
    for (const release of releases) {
      const validated = validateContextContractReleaseEvidence(release);
      const key = releaseAuthorityKey(validated.repository, validated.releaseRef);
      if (trustedPins.has(key)) {
        reject("trusted release authority contains a duplicate release pin");
      }
      trustedPins.set(key, validated);
    }
    this.releases = trustedPins;
  }

  resolveRelease(
    repository: string,
    releaseRef: string,
  ): Readonly<ContextContractReleaseEvidence> | null {
    return this.releases.get(releaseAuthorityKey(repository, releaseRef)) ?? null;
  }
}

function requireTrustedReleaseMatch(
  candidate: Readonly<ContextContractReleaseEvidence>,
  trusted: Readonly<ContextContractReleaseEvidence>,
): void {
  for (const field of TRUSTED_RELEASE_FIELDS) {
    if (candidate[field] !== trusted[field]) {
      reject(`trusted release authority does not match ${field}`);
    }
  }

  const candidateCapabilities = new Set(candidate.capabilities);
  const trustedCapabilities = new Set(trusted.capabilities);
  if (candidateCapabilities.size !== trustedCapabilities.size) {
    reject("trusted release authority does not match capabilities");
  }
  for (const capability of candidateCapabilities) {
    if (!trustedCapabilities.has(capability)) {
      reject("trusted release authority does not match capabilities");
    }
  }
}

/**
 * Admit a Context Graph release only after a separate trusted authority authenticates exact identity.
 *
 * Structural validation runs before the trust lookup so malformed evidence receives precise
 * diagnostics. The authority is then queried by canonical repository and immutable tag ref. Noema
 * admits only when every source/artifact/SBOM/provenance/conformance/promotion field and the complete
 * capability set exactly match the independently pinned release. Missing authority or lookup failure
 * is fail-closed.
 */
export function admitContextContractRelease(
  candidate: ContextContractReleaseEvidence,
  authority?: ContextContractReleaseAuthority,
): Readonly<ContextContractReleaseEvidence> {
  const validatedCandidate = validateContextContractReleaseEvidence(candidate);
  if (!authority) {
    return reject("trusted release authority is required before production admission");
  }

  let trustedCandidate: Readonly<ContextContractReleaseEvidence> | null;
  try {
    trustedCandidate = authority.resolveRelease(
      validatedCandidate.repository,
      validatedCandidate.releaseRef,
    );
  } catch {
    return reject("trusted release authority lookup failed");
  }
  if (!trustedCandidate) {
    return reject("trusted release authority did not recognize release");
  }

  const trustedRelease = validateContextContractReleaseEvidence(
    trustedCandidate as ContextContractReleaseEvidence,
  );
  requireTrustedReleaseMatch(validatedCandidate, trustedRelease);
  return trustedRelease;
}
