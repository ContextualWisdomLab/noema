import { describe, expect, it } from "vitest";

import {
  ContextContractReleaseAdmissionError,
  PinnedContextContractReleaseAuthority,
  REQUIRED_CONTEXT_CONTRACT_CAPABILITIES,
  REQUIRED_CONTEXT_CONTRACT_PROFILE,
  REQUIRED_CONTEXT_CONTRACT_RELEASE_SOURCE,
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

  it("normalizes throwing top-level evidence getters to the documented admission error", () => {
    const candidate = releaseEvidence();
    Object.defineProperty(candidate, "repository", {
      enumerable: true,
      get() {
        throw new Error("hostile repository getter");
      },
    });

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
  });

  it("normalizes throwing capability accessors without consuming a custom iterator", () => {
    const candidate = releaseEvidence();
    const capabilities = [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES];
    Object.defineProperty(capabilities, 0, {
      configurable: true,
      get() {
        throw new Error("hostile capability getter");
      },
    });
    Object.defineProperty(capabilities, Symbol.iterator, {
      configurable: true,
      value: function* hostileIterator() {
        throw new Error("capability iterator must not execute");
      },
    });
    candidate.capabilities = capabilities;

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
  });

  it("normalizes a revoked capability-array proxy to the admission domain error", () => {
    const candidate = releaseEvidence();
    const revocable = Proxy.revocable([...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES], {});
    candidate.capabilities = revocable.proxy;
    revocable.revoke();

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
  });

  it("normalizes a throwing capability-array length trap to the admission domain error", () => {
    const candidate = releaseEvidence();
    candidate.capabilities = new Proxy([...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES], {
      get(target, property, receiver) {
        if (property === "length") {
          throw new Error("hostile capability length trap");
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
  });

  it.each(["", " ", "line\nbreak", "x".repeat(257)])(
    "rejects noncanonical capability identifiers: %j",
    (capability) => {
      expect(() =>
        validateContextContractReleaseEvidence(releaseEvidence([capability])),
      ).toThrowError(/capability identifiers must be canonical/i);
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
