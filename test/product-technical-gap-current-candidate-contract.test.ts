import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap current candidate contract", () => {
  it("records the active external-extension Policy / Approval gap without overclaiming completion", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("issue #545 / PR #560");
    expect(baseline).toContain("Earlier test-only exact `7ca9aebee6f92053913c0bbc665c8de77650891f`");
    expect(baseline).toContain("hosted application CI `34206149899`, job `101995980303`");
    expect(baseline).toContain("source/catalog/scanner authority와 Noema Policy / Approval issuance를 분리했다");
    expect(baseline).toContain("Unknown extension에는 implicit grant가 없다");
    expect(baseline).toContain("PR #560의 ADR 0015는 candidate-only `Proposed`");
    expect(baseline).toContain("context-graph-contracts");
    expect(baseline).toContain("live plugin installation 또는 buyer completion을 주장하지 않는다");
    expect(baseline).toContain("immutable Noema release");
  });
});
