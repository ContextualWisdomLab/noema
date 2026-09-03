import { describe, expect, it } from "vitest";

import {
  ContextContractReleaseAdmissionError,
  PinnedContextContractReleaseAuthority,
  REQUIRED_CONTEXT_CONTRACT_CAPABILITIES,
  REQUIRED_CONTEXT_CONTRACT_PROFILE,
  admitContextContractRelease,
  validateContextContractReleaseEvidence,
  type ContextContractReleaseEvidence,
} from "../src/context-fabric/context-contract-release-admission";

const releaseEvidence = (
  overrides: Record<string, unknown> = {},
): ContextContractReleaseEvidence =>
  ({
    repository: "ContextualWisdomLab/context-graph-contracts",
    publicationState: "released",
    releaseVersion: "0.1.0",
    releaseRef: "refs/tags/v0.1.0",
    sourceCommit: "a".repeat(40),
    provenanceSourceCommit: "a".repeat(40),
    packageSha256: "b".repeat(64),
    sbomSha256: "c".repeat(64),
    provenanceSha256: "d".repeat(64),
    releaseSourceManifestSha256: "e".repeat(64),
    releaseSourceAttestationSha256: "f".repeat(64),
    releaseSourceRef: "refs/heads/main",
    releaseSourceSignerWorkflow:
      "ContextualWisdomLab/context-graph-contracts/.github/workflows/supply-chain.yml",
    contextAssertionSchema: REQUIRED_CONTEXT_CONTRACT_PROFILE.contextAssertionSchema,
    cloudEventEnvelopeSchema: REQUIRED_CONTEXT_CONTRACT_PROFILE.cloudEventEnvelopeSchema,
    contextAssertionEventType: REQUIRED_CONTEXT_CONTRACT_PROFILE.contextAssertionEventType,
    contextAssertionEventProfile: REQUIRED_CONTEXT_CONTRACT_PROFILE.contextAssertionEventProfile,
    contextAssertionEventMediaType: REQUIRED_CONTEXT_CONTRACT_PROFILE.contextAssertionEventMediaType,
    conformance: "passed",
    admission: "passed",
    compatibility: "passed",
    migration: "not-required",
    licensing: "passed",
    notice: "not-required",
    capabilities: [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES],
    ...overrides,
  }) as unknown as ContextContractReleaseEvidence;

describe("Context Graph release-source attestation admission", () => {
  it("rejects a candidate whose source-manifest identity differs from the trusted release", () => {
    const authority = new PinnedContextContractReleaseAuthority([releaseEvidence()]);
    const forged = releaseEvidence({ releaseSourceManifestSha256: "0".repeat(64) });

    expect(() => admitContextContractRelease(forged, authority)).toThrowError(
      /trusted release authority does not match releaseSourceManifestSha256/i,
    );
  });

  it("rejects release evidence that omits independently verified source-manifest provenance", () => {
    const candidate = releaseEvidence();
    delete (candidate as unknown as Record<string, unknown>).releaseSourceAttestationSha256;

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
  });
});
