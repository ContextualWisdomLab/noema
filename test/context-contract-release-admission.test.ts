import { describe, expect, it } from "vitest";

import {
  ContextContractReleaseAdmissionError,
  PinnedContextContractReleaseAuthority,
  REQUIRED_CONTEXT_CONTRACT_CAPABILITIES,
  admitContextContractRelease,
  validateContextContractReleaseEvidence,
  type ContextContractReleaseEvidence,
} from "../src/context-fabric/context-contract-release-admission";

const releaseEvidence = (
  overrides: Partial<ContextContractReleaseEvidence> = {},
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
  conformance: "passed",
  admission: "passed",
  capabilities: [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES],
  ...overrides,
});

const unsafeEvidence = (overrides: Record<string, unknown>): ContextContractReleaseEvidence =>
  ({ ...releaseEvidence(), ...overrides }) as unknown as ContextContractReleaseEvidence;

describe("Context Graph released-contract admission", () => {
  it("validates and detaches candidate metadata without treating it as production authority", () => {
    const candidate = releaseEvidence();
    const validated = validateContextContractReleaseEvidence(candidate);

    candidate.sourceCommit = "e".repeat(40);
    candidate.capabilities[0] = "mutated";

    expect(validated).toEqual(releaseEvidence());
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.capabilities)).toBe(true);
  });

  it("rejects a syntactically valid self-asserted release until trusted authority is supplied", () => {
    expect(() => admitContextContractRelease(releaseEvidence())).toThrowError(
      /trusted release authority is required before production admission/i,
    );
  });

  it("rejects forged but well-formed artifact identity against a trusted pinned release", () => {
    const authority = new PinnedContextContractReleaseAuthority([releaseEvidence()]);
    const forged = releaseEvidence({ packageSha256: "e".repeat(64) });

    expect(() => admitContextContractRelease(forged, authority)).toThrowError(
      /trusted release authority does not match packageSha256/i,
    );
  });

  it("admits only the exact immutable release pinned by the trusted authority adapter", () => {
    const trustedRelease = releaseEvidence();
    const authority = new PinnedContextContractReleaseAuthority([trustedRelease]);
    const admitted = admitContextContractRelease(releaseEvidence(), authority);

    trustedRelease.sourceCommit = "e".repeat(40);
    trustedRelease.capabilities[0] = "mutated";

    expect(admitted).toEqual(releaseEvidence());
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted.capabilities)).toBe(true);
  });

  it("fails closed when the trusted authority has no exact release ref", () => {
    const authority = new PinnedContextContractReleaseAuthority([
      releaseEvidence({ releaseVersion: "0.2.0", releaseRef: "refs/tags/v0.2.0" }),
    ]);

    expect(() => admitContextContractRelease(releaseEvidence(), authority)).toThrowError(
      /trusted release authority did not recognize release/i,
    );
  });

  it("rejects duplicate trusted pins for one repository and release ref", () => {
    expect(
      () => new PinnedContextContractReleaseAuthority([releaseEvidence(), releaseEvidence()]),
    ).toThrowError(/trusted release authority contains a duplicate release pin/i);
  });

  it("validates an exact plain SemVer tag as well as the conventional v-prefixed tag", () => {
    expect(
      validateContextContractReleaseEvidence(releaseEvidence({ releaseRef: "refs/tags/0.1.0" })).releaseVersion,
    ).toBe("0.1.0");
  });

  it.each([
    unsafeEvidence({ repository: 7 }),
    releaseEvidence({ repository: "ContextualWisdomLab/enterprise-architecture-core" }),
    unsafeEvidence({ publicationState: {} }),
    releaseEvidence({ publicationState: "draft" }),
    unsafeEvidence({ releaseVersion: 1 }),
    releaseEvidence({ releaseVersion: "v0.1.0" }),
    unsafeEvidence({ releaseRef: [] }),
    releaseEvidence({ releaseRef: "refs/heads/main" }),
    releaseEvidence({ releaseRef: "refs/tags/v0.2.0" }),
    unsafeEvidence({ sourceCommit: 42 }),
    releaseEvidence({ sourceCommit: "A".repeat(40) }),
    unsafeEvidence({ provenanceSourceCommit: false }),
    releaseEvidence({ provenanceSourceCommit: "z".repeat(40) }),
    releaseEvidence({ provenanceSourceCommit: "e".repeat(40) }),
    unsafeEvidence({ packageSha256: null }),
    releaseEvidence({ packageSha256: "B".repeat(64) }),
    unsafeEvidence({ sbomSha256: [] }),
    releaseEvidence({ sbomSha256: "c".repeat(63) }),
    unsafeEvidence({ provenanceSha256: {} }),
    releaseEvidence({ provenanceSha256: "d".repeat(65) }),
    unsafeEvidence({ conformance: 1 }),
    releaseEvidence({ conformance: "failed" }),
    unsafeEvidence({ admission: 1 }),
    releaseEvidence({ admission: "failed" }),
    unsafeEvidence({ capabilities: "context-assertion" }),
    unsafeEvidence({ capabilities: [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES, 7] }),
    releaseEvidence({
      capabilities: [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES, REQUIRED_CONTEXT_CONTRACT_CAPABILITIES[0]],
    }),
  ])("rejects malformed, mutable, non-released, or internally inconsistent evidence %#", (candidate) => {
    expect(() => validateContextContractReleaseEvidence(candidate)).toThrow(
      ContextContractReleaseAdmissionError,
    );
  });

  it.each(REQUIRED_CONTEXT_CONTRACT_CAPABILITIES)(
    "rejects release evidence missing required capability %s",
    (missing) => {
      const capabilities = REQUIRED_CONTEXT_CONTRACT_CAPABILITIES.filter(
        (capability) => capability !== missing,
      );
      expect(() => validateContextContractReleaseEvidence(releaseEvidence({ capabilities }))).toThrowError(
        new RegExp(`missing required capability: ${missing}`),
      );
    },
  );
});
