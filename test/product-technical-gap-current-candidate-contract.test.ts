import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap current candidate contract", () => {
  it("records the active external-extension Policy / Approval gap without overclaiming completion", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("issue #545 / PR #560");
    expect(baseline).toContain("Test-only exact `4be371ec08b852f4d00829ba5aa6936df6564b5e`");
    expect(baseline).toContain("Hosted application CI `34221586992`, job `102045717213`");
    expect(baseline).toContain("Noema Policy / Approval issuance");
    expect(baseline).toContain("runtime wall clock");
    expect(baseline).toContain("same invocation identity");
    expect(baseline).toContain("normalized invocation envelope");
    expect(baseline).toContain("core receipt authority");
    expect(baseline).toContain("public invocation-envelope authority");
    expect(baseline).toContain("policy drift and revocation");
    expect(baseline).toContain("before issuing an activation");
    expect(baseline).toContain("PR #560의 ADR 0015는 candidate-only `Proposed`");
    expect(baseline).toContain("context-graph-contracts");
    expect(baseline).toContain("live plugin installation 또는 buyer completion을 주장하지 않는다");
    expect(baseline).toContain("immutable Noema release");
  });
});
