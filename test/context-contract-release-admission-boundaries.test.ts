import { describe, expect, it } from "vitest";

import {
  ContextContractReleaseAdmissionError,
  PinnedContextContractReleaseAuthority,
  REQUIRED_CONTEXT_CONTRACT_CAPABILITIES,
  REQUIRED_CONTEXT_CONTRACT_PROFILE,
  admitContextContractRelease,
  validateContextContractReleaseEvidence,
  type ContextContractReleaseAuthority,
  type ContextContractReleaseEvidence,
} from "../src/context-fabric/context-contract-release-admission";

const releaseEvidence = (
  extraCapabilities: string[] = [],
): ContextContractReleaseEvidence => ({
  repository: "ContextualWisdomLab/context-graph-contracts",
  publicationState: "released",
  releaseVersion: "0.1.0",
  releaseRef: "refs/tags/v0.1.0",
  sourceCommit: "a".repeat(40),
  provenanceSourceCommit: "a".repeat(40),
  packageSha256: "b".repeat(64),
  sbomSha256: "c".repeat(64),
  provenanceSha256: "d".repeat(64),
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
  capabilities: [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES, ...extraCapabilities],
});

const assertImmutableSnapshotType = (
  evidence: ReturnType<typeof validateContextContractReleaseEvidence>,
): void => {
  // @ts-expect-error Validated release capabilities are an immutable consumer snapshot.
  evidence.capabilities.push("mutated-after-validation");
};
void assertImmutableSnapshotType;

describe("Context Graph release-authority boundary coverage", () => {
  it.each([null, undefined])(
    "rejects an unreadable top-level release candidate through the typed admission boundary: %s",
    (candidate) => {
      expect(() =>
        validateContextContractReleaseEvidence(
          candidate as unknown as ContextContractReleaseEvidence,
        ),
      ).toThrow(ContextContractReleaseAdmissionError);
    },
  );

  it("rejects a trusted release whose capability-set cardinality differs", () => {
    const authority = new PinnedContextContractReleaseAuthority([releaseEvidence()]);

    expect(() =>
      admitContextContractRelease(releaseEvidence(["noema-extra-capability"]), authority),
    ).toThrowError(/trusted release authority does not match capabilities/i);
  });

  it("rejects equal-sized capability sets whose members differ", () => {
    const authority = new PinnedContextContractReleaseAuthority([
      releaseEvidence(["trusted-extra-capability"]),
    ]);

    expect(() =>
      admitContextContractRelease(releaseEvidence(["candidate-extra-capability"]), authority),
    ).toThrowError(/trusted release authority does not match capabilities/i);
  });

  it("fails closed when the independently supplied release authority throws", () => {
    const unavailableAuthority: ContextContractReleaseAuthority = {
      resolveRelease() {
        throw new Error("registry transport unavailable");
      },
    };

    expect(() => admitContextContractRelease(releaseEvidence(), unavailableAuthority)).toThrowError(
      /trusted release authority lookup failed/i,
    );
  });
});
