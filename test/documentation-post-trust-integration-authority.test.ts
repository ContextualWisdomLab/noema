import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-trust-integration documentation authority", () => {
  it("binds the commercial gap baseline to the protected #554 merge and restacked durable workflow candidate", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "`main@0dec8d84b1e4744e7a9c6a77e2e2631a183ee2ab`",
    );
    expect(baseline).toContain(
      "PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` integrated normally",
    );
    expect(baseline).toContain(
      "PR #542 exact `7f743f4ee8d81c8d52511ef421d8e40a32edf2a8`",
    );
    expect(baseline).toContain("ordinary/non-force restack");
    expect(baseline).not.toContain("#554가 central trust prerequisite로 먼저 통합된 뒤");
    expect(baseline).not.toContain("#554 통합 뒤 #542를 새 protected main에 non-force restack");
  });
});
