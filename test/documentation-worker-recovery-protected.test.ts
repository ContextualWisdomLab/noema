import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected Worker recovery documentation authority", () => {
  it("classifies merged #612 as protected source without promoting rehearsal evidence", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "merged PR #612 exact `a919be3bc2a04068e25a4592e0c9c26f8e63534b`",
    );
    expect(baseline).toContain("Protected #612");
    expect(baseline).not.toContain("Active Worker deployment recovery candidate");
    expect(baseline).not.toContain("Draft PR #612");
    expect(baseline).not.toContain("candidate source under review");
    expect(baseline).toContain("ADR 0018은 `Proposed`");
    expect(baseline).toContain("controlled production recovery rehearsal");
  });
});
