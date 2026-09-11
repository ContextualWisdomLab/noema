import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected Worker recovery authority documentation", () => {
  it("classifies merged #614 UUID canonicalization as protected source without promoting rehearsal", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const operability = readFileSync("docs/OPERABILITY.md", "utf8");

    expect(baseline).toContain("merged PR #614 exact `77c5116a2e58e8a154ee893a3825da19c9c1f357`");
    expect(baseline).toContain(
      "## Protected Worker deployment recovery source — issue #611 / merged PRs #612 + #614",
    );
    expect(baseline).toContain("UUID textual aliases");
    expect(baseline).toContain("lowercase canonical identity");
    expect(baseline).not.toContain("protected #612 source integration 자체를 controlled production recovery rehearsal로 승격하지 않는다");

    expect(operability).not.toContain("Candidate #612 adds a source-level Worker recovery contract");
    expect(operability).toContain("Protected #612/#614 recovery source");
    expect(operability).toContain("UUID textual aliases");
    expect(operability).toContain("controlled production recovery rehearsal");
    expect(operability).toContain("ADR-0018 remains `Proposed`");
  });
});
