import { describe, expect, it } from "vitest";

import {
  ContextContractReleaseAdmissionError,
  REQUIRED_CONTEXT_CONTRACT_CAPABILITIES,
  REQUIRED_CONTEXT_CONTRACT_PROFILE,
  REQUIRED_CONTEXT_CONTRACT_RELEASE_SOURCE,
  validateContextContractReleaseEvidence,
  type ContextContractReleaseEvidence,
} from "../src/context-fabric/context-contract-release-admission";

const releaseEvidence = (): ContextContractReleaseEvidence => ({
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
  releaseSourceRef: REQUIRED_CONTEXT_CONTRACT_RELEASE_SOURCE.sourceRef,
  releaseSourceSignerWorkflow: REQUIRED_CONTEXT_CONTRACT_RELEASE_SOURCE.signerWorkflow,
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
});

describe("Context Graph capability-container hostile metadata", () => {
  it("normalizes a revoked capability-array proxy to the admission domain error", () => {
    const candidate = releaseEvidence();
    const revocable = Proxy.revocable([...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES], {});
    candidate.capabilities = revocable.proxy;
    revocable.revoke();

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
    expect(() => validateContextContractReleaseEvidence(candidate)).toThrowError(
      /capabilities could not be read/i,
    );
  });

  it("normalizes a throwing capability length trap to the admission domain error", () => {
    const candidate = releaseEvidence();
    candidate.capabilities = new Proxy([...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES], {
      get(target, property, receiver) {
        if (property === "length") throw new Error("hostile capability length trap");
        return Reflect.get(target, property, receiver);
      },
    });

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
    expect(() => validateContextContractReleaseEvidence(candidate)).toThrowError(
      /capabilities could not be read/i,
    );
  });

  it("rejects capability collections larger than the bounded external metadata contract", () => {
    const candidate = releaseEvidence();
    candidate.capabilities = [
      ...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES,
      ...Array.from({ length: 55 }, (_, index) => `extension-capability-${index}`),
    ];

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
    expect(() => validateContextContractReleaseEvidence(candidate)).toThrowError(
      /capabilities must contain at most 64 entries/i,
    );
  });

  it("rejects capability identifiers larger than the bounded external metadata contract", () => {
    const candidate = releaseEvidence();
    candidate.capabilities = [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES, "x".repeat(257)];

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
    expect(() => validateContextContractReleaseEvidence(candidate)).toThrowError(
      /capability identifiers must be canonical printable ASCII without whitespace/i,
    );
  });
});