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

/** Immutable publication evidence required by Noema's Context Graph anti-corruption layer. */
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
  capabilities: string[];
}

/** Raised when a candidate Context Graph dependency is not release-grade authority for Noema. */
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

function requirePattern(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (!pattern.test(value)) reject(`${label} is not canonical`);
  return value;
}

/**
 * Admit a released Context Graph contract for production use by Noema.
 *
 * This boundary deliberately refuses branch heads, Draft PRs, predecessor artifacts, partial
 * conformance, and mutable foreign source. Successful admission proves only immutable package
 * identity and the provider-neutral contract surface Noema needs. It does not promote Context
 * Graph data, Agent task/result/reasoning/tool payloads, or EA state into Noema-owned truth.
 */
export function admitContextContractRelease(
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
    capabilities: rawCapabilities,
  } = candidate;

  const repository = requireExactString(rawRepository, CONTEXT_CONTRACT_REPOSITORY, "repository");
  const publicationState = requireExactString(rawPublicationState, "released", "publicationState");
  const releaseVersion = requirePattern(rawReleaseVersion, SEMVER_PATTERN, "releaseVersion");
  const releaseRef = requirePattern(rawReleaseRef, /^refs\/tags\/[!-~]+$/u, "releaseRef");
  const versionTag = `refs/tags/v${releaseVersion}`;
  const plainTag = `refs/tags/${releaseVersion}`;
  if (releaseRef !== versionTag && releaseRef !== plainTag) reject("releaseRef must bind the exact releaseVersion tag");

  const sourceCommit = requirePattern(rawSourceCommit, COMMIT_PATTERN, "sourceCommit");
  const provenanceSourceCommit = requirePattern(rawProvenanceSourceCommit, COMMIT_PATTERN, "provenanceSourceCommit");
  if (provenanceSourceCommit !== sourceCommit) reject("provenanceSourceCommit must equal sourceCommit");

  const packageSha256 = requirePattern(rawPackageSha256, SHA256_PATTERN, "packageSha256");
  const sbomSha256 = requirePattern(rawSbomSha256, SHA256_PATTERN, "sbomSha256");
  const provenanceSha256 = requirePattern(rawProvenanceSha256, SHA256_PATTERN, "provenanceSha256");
  const conformance = requireExactString(rawConformance, "passed", "conformance");
  const admission = requireExactString(rawAdmission, "passed", "admission");

  if (!Array.isArray(rawCapabilities)) reject("capabilities must be an array");
  const capabilities: string[] = [];
  for (const capability of rawCapabilities) {
    if (typeof capability !== "string") reject("capabilities must contain only strings");
    capabilities.push(capability);
  }

  const capabilitySet = new Set(capabilities);
  if (capabilitySet.size !== capabilities.length) reject("capabilities must not contain duplicates");
  for (const requiredCapability of REQUIRED_CONTEXT_CONTRACT_CAPABILITIES) {
    if (!capabilitySet.has(requiredCapability)) reject(`missing required capability: ${requiredCapability}`);
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
    capabilities: admittedCapabilities as string[],
  });
}
