import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONVERGENCE_HEADING = "## Protected private-reporting authority convergence — merged PRs #722 + #723 + #724";

function convergenceSection(baseline: string) {
  const start = baseline.indexOf(CONVERGENCE_HEADING);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextHeading = baseline.indexOf("\n## ", start + CONVERGENCE_HEADING.length);
  return baseline.slice(start, nextHeading === -1 ? baseline.length : nextHeading);
}

describe("product-technical gap current authority", () => {
  it("records the protected private-reporting lineage and current downstream candidates inside the dated convergence section", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = convergenceSection(baseline);

    expect(section).toContain(CONVERGENCE_HEADING);
    expect(section).toContain("PR `#722` reviewed source exact `b4563512dce9ce9084548cad29f247911949c359`");
    expect(section).toContain("PR `#722` GitHub-verified normal merge `227e746662d29dcc8fe360f055b7fdb7857c09fd`");
    expect(section).toContain("PR `#723` reviewed source exact `d73a281add7081ff85dc27dc9312d30b20b39c0e`");
    expect(section).toContain("PR `#723` GitHub-verified normal merge `73bba82c1df315d0b5c6acf2c876f08a3afff708`");
    expect(section).toContain("PR `#724` reviewed source exact `fc0afaf87cc24a9a54a71078324fd9486f4bc929`");
    expect(section).toContain("PR `#724` GitHub-verified normal merge `a69bfadb9a450a37a810a71d4070d652e23d3d60`");
    expect(section).toContain("Dated downstream observation on 2026-09-21 KST");
    expect(section).toContain("main@a69bfadb9a450a37a810a71d4070d652e23d3d60");
    expect(section).toContain("ordinary/non-force descendants");
    expect(section).toContain("PR #726 exact `560a662b09c9742d46a8ba0a977a8872c5b199fe`");
    expect(section).toContain("PR #727 exact `8806d06ac2cdf3ca878c54fdc760eb7cd5c8be10`");
    expect(section).toContain("PR #728 exact `5deb783fd0985f374630112a92b921bb2f420356`");
    expect(section).toContain("all current hosted lanes are queued/nonterminal and are not merge authority");
  });

  it("keeps release observation current without promoting absence into release completion", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("Dated release observation for this repair (2026-09-21 KST)는 GitHub Releases **0건**이다.");
    expect(baseline).not.toContain("Dated release observation for this repair (2026-09-16 KST)는 GitHub Releases **0건**이다.");
    expect(baseline).toContain("GitHub release collection에 immutable Noema release가 실제 존재하기 전");
  });
});
