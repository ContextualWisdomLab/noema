import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-trust-integration documentation authority", () => {
  it("binds commercial-gap construction evidence to protected integrations without freezing moving heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const protectedHistory of [
      "protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001`",
      "merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`",
      "merged PR #548 exact `fb44888bd571cae61dbfc93c1b46675855fbfc9c`",
      "merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`",
      "merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`",
      "merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`",
      "merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`",
      "central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`",
    ]) {
      expect(baseline).toContain(protectedHistory);
    }
    expect(baseline).toContain("ordinary/non-force semantic convergence");
    expect(baseline).toContain("predecessor GREEN");
    expect(baseline).toContain("Construction snapshot");
    expect(baseline).not.toContain("protected `main@d6394b2aa73e6fc57fccdad74ea38ad87f79e7f8`");
    expect(baseline).not.toContain("PR #542 exact `195fdd70b267332f246d93beb95fa96fabade52e`");
    expect(baseline).not.toContain("PR #540은 아직 merge authority가 아니다");
  });
});
