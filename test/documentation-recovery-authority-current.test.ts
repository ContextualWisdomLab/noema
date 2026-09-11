import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected Worker recovery authority documentation", () => {
  it("classifies merged #616 post-mutation verification as protected source without promoting rehearsal", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const operability = readFileSync("docs/OPERABILITY.md", "utf8");

    expect(baseline).toContain("merged PR #616 exact `da8461f1f5a6d02d926dd295fc88abe2c6167dfa`");
    expect(baseline).toContain(
      "## Protected Worker deployment recovery source — issue #611 / merged PRs #612 + #614 + #616",
    );
    expect(baseline).toContain("fresh post-mutation provider status");
    expect(baseline).toContain("mutation acknowledgement");
    expect(baseline).toContain("lowercase canonical identity");
    expect(baseline).not.toContain("protected #616 source integration 자체를 controlled production recovery rehearsal로 승격하지 않는다");

    expect(operability).not.toContain("Protected #612/#614 recovery source");
    expect(operability).toContain("Protected #612/#614/#616 recovery source");
    expect(operability).toContain("fresh post-mutation provider status");
    expect(operability).toContain("mutation acknowledgement");
    expect(operability).toContain("controlled production recovery rehearsal");
    expect(operability).toContain("ADR-0018 remains `Proposed`");
  });
});
