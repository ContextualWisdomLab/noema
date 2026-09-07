import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-trust-integration documentation authority", () => {
  it("binds the commercial gap baseline to protected #554/#526 integration and current convergence candidates", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "`main@d9b2a956960be72a5370afa50275a405dfbba529`",
    );
    expect(baseline).toContain(
      "PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` integrated normally",
    );
    expect(baseline).toContain(
      "merged PR #526 exact `399d51d24bab96d204f232036938da7ab1034aa3`",
    );
    expect(baseline).toContain(
      "PR #542 exact `4616b5e93e19d51973aea330aa4124b51725b795`",
    );
    expect(baseline).toContain(
      "PR #540 exact `2eba9d6b1e3365f745dd43bb8e40e87b0f2ead3a`",
    );
    expect(baseline).toContain(
      "PR #543 exact `b14b37ca12b3b6ae1999d250a393997ffff04dec`",
    );
    expect(baseline).toContain(
      "PR #553 exact `4c213e184b94b70558092ca739990464f889f06c`",
    );
    expect(baseline).toContain("ordinary/non-force restack");
    expect(baseline).not.toContain("#554가 central trust prerequisite로 먼저 통합된 뒤");
    expect(baseline).not.toContain("#554 통합 뒤 #542를 새 protected main에 non-force restack");
    expect(baseline).not.toContain(
      "#540은 old exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1`에서 멈춰",
    );
  });
});