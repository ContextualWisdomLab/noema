import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-trust-integration documentation authority", () => {
  it("binds commercial gaps to protected integrations without freezing moving heads", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const integrated of [
      "merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`",
      "merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`",
      "merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`",
      "merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`",
      "merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`",
      "merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`",
      "merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`",
      "merged PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`",
    ]) {
      expect(baseline).toContain(integrated);
    }
    expect(baseline).toContain("predecessor GREEN");
    expect(baseline).toContain("ordinary/non-force semantic convergence");
    expect(baseline).toContain("queued는 GREEN이 아니다");
  });
});
