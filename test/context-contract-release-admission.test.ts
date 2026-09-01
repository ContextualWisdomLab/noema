import { describe, expect, it } from "vitest";

import {
  ContextContractReleaseAdmissionError,
  REQUIRED_CONTEXT_CONTRACT_CAPABILITIES,
  admitContextContractRelease,
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
  it("accepts only detached immutable evidence for the required Noema contract surface", () => {
    const candidate = releaseEvidence();
    const admitted = admitContextContractRelease(candidate);

    candidate.sourceCommit = "e".repeat(40);
    candidate.capabilities[0] = "mutated";

    expect(admitted).toEqual(releaseEvidence());
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted.capabilities)).toBe(true);
  });

  it("accepts an exact plain SemVer tag as well as the conventional v-prefixed tag", () => {
    expect(admitContextContractRelease(releaseEvidence({ releaseRef: "refs/tags/0.1.0" })).releaseVersion).toBe("0.1.0");
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
    releaseEvidence({ capabilities: [...REQUIRED_CONTEXT_CONTRACT_CAPABILITIES, REQUIRED_CONTEXT_CONTRACT_CAPABILITIES[0]] }),
  ])("rejects malformed, mutable, non-released, or internally inconsistent evidence %#", (candidate) => {
    expect(() => admitContextContractRelease(candidate)).toThrow(ContextContractReleaseAdmissionError);
  });

  it.each(REQUIRED_CONTEXT_CONTRACT_CAPABILITIES)("rejects release evidence missing required capability %s", (missing) => {
    const capabilities = REQUIRED_CONTEXT_CONTRACT_CAPABILITIES.filter((capability) => capability !== missing);
    expect(() => admitContextContractRelease(releaseEvidence({ capabilities }))).toThrowError(
      new RegExp(`missing required capability: ${missing}`),
    );
  });
});
