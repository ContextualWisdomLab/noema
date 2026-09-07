import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-trust-integration documentation authority", () => {
  it("binds the commercial gap baseline to protected integrations and current convergence candidates", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "protected `main@4c1d174adae3a3cc1ced54913ac2515d768647ef`",
    );
    expect(baseline).toContain(
      "merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`",
    );
    expect(baseline).toContain(
      "central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`",
    );
    expect(baseline).toContain(
      "PR #542 exact `9f2b8afef7ad0ecfd32dd94c3e7581ff66816a84`",
    );
    expect(baseline).toContain(
      "PR #540 exact `2eba9d6b1e3365f745dd43bb8e40e87b0f2ead3a`",
    );
    expect(baseline).toContain(
      "PR #553 exact `31d2e5c02c5bff5bbbae07abbad4c5f2a0528990`",
    );
    expect(baseline).toContain("ordinary/non-force semantic convergence");
    expect(baseline).toContain("predecessor GREEN");
    expect(baseline).not.toContain(
      "PR #542 exact `6cb43c1b45747f000ee176212cbd00f5ee518396`",
    );
    expect(baseline).not.toContain("#554가 central trust prerequisite로 먼저 통합된 뒤");
    expect(baseline).not.toContain("#554 통합 뒤 #542를 새 protected main에 non-force restack");
    expect(baseline).not.toContain(
      "#540은 old exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1`에서 멈춰",
    );
  });
});
