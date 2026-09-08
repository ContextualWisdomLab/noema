import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-trust-integration documentation authority", () => {
  it("binds commercial-gap evidence to current protected integrations without freezing moving heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const protectedHistory of [
      "protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`",
      "merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`",
      "merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`",
      "merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`",
      "merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`",
      "merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`",
      "merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`",
      "merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`",
      "central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`",
    ]) {
      expect(baseline).toContain(protectedHistory);
    }
    expect(baseline).toContain("ordinary/non-force semantic convergence");
    expect(baseline).toContain("predecessor GREEN");
    expect(baseline).toContain("moving observation");
    expect(baseline).not.toContain("protected `main@59ae66de96b64c8ce51f0030a624815a08dbefdd`");
    expect(baseline).not.toContain("protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001`");
    expect(baseline).not.toContain("central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`");
    expect(baseline).not.toContain("PR #542 exact `195fdd70b267332f246d93beb95fa96fabade52e`");
    expect(baseline).not.toContain("PR #540은 아직 merge authority가 아니다");
  });
});
