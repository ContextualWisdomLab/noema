import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `50d47dae5d9d10fcf13e383b16f89e05ca6e2aea`";
const STALE_730_EXACT = "#730 current exact `e7ec8d0dc71d31342f0514fef5578f04123caa1a`";
const STATUS_PROJECTION_AUTHORITY =
  "preserves exact Commit Status context/state identity before terminal merge-authority evaluation";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `50d47dae5d9d10fcf13e383b16f89e05ca6e2aea`";
const GOVERNANCE_STATUS_PROJECTION_AUTHORITY = "exact Commit Status collection projection identity";

describe("product-technical gap commit-status projection authority", () => {
  function currentOpenLaneSection(baseline: string) {
    const start = baseline.indexOf(CURRENT_OPEN_LANE_HEADING);
    expect(start).toBeGreaterThanOrEqual(0);
    const nextHeading = baseline.indexOf("\n## ", start + CURRENT_OPEN_LANE_HEADING.length);
    return baseline.slice(start, nextHeading === -1 ? baseline.length : nextHeading);
  }

  function currentGovernanceRow(baseline: string) {
    const rows = baseline.split("\n").filter((line) => line.startsWith(GOVERNANCE_ROW_PREFIX));
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it("binds the active commercial authority to the exact Commit Status projection repair", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = currentOpenLaneSection(baseline);
    const row = currentGovernanceRow(baseline);

    expect(section).toContain(CURRENT_730_EXACT);
    expect(section).not.toContain(STALE_730_EXACT);
    expect(section).toContain(STATUS_PROJECTION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_CANDIDATE);
    expect(row).toContain(GOVERNANCE_STATUS_PROJECTION_AUTHORITY);
  });
});
