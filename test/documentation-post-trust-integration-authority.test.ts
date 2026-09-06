import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-trust-integration documentation authority", () => {
  it("binds the commercial gap baseline to the protected #554 merge and current restacked candidates", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "`main@0dec8d84b1e4744e7a9c6a77e2e2631a183ee2ab`",
    );
    expect(baseline).toContain(
      "PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` integrated normally",
    );
    expect(baseline).toContain(
      "PR #542 exact `4616b5e93e19d51973aea330aa4124b51725b795`",
    );
    expect(baseline).toContain(
      "PR #540 exact `2eba9d6b1e3365f745dd43bb8e40e87b0f2ead3a`",
    );
    expect(baseline).toContain("ordinary/non-force restack");
    expect(baseline).not.toContain("#554가 central trust prerequisite로 먼저 통합된 뒤");
    expect(baseline).not.toContain("#554 통합 뒤 #542를 새 protected main에 non-force restack");
    expect(baseline).not.toContain(
      "#540은 old exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1`에서 멈춰",
    );
  });
});
