import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `9037b4831db5b4b5658ca07c7149551c0f6b322a`";
const STALE_730_EXACT = "#730 current exact `c9ed50e380d4498a4386a1b28c440aa4414991e6`";
const STATUS_PROJECTION_AUTHORITY =
  "preserves exact Commit Status context/state identity before terminal merge-authority evaluation";
const RETRY_CHRONOLOGY_AUTHORITY =
  "fails closed when same-suite retry chronology lacks parseable `started_at`/`completed_at` evidence";
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `9037b4831db5b4b5658ca07c7149551c0f6b322a`";
const GOVERNANCE_STATUS_PROJECTION_AUTHORITY = "exact Commit Status collection projection identity";
const GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY = "fail-closed unknown retry chronology";
const GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY =
  "independently rejects missing approval and missing blocking marker-to-state mappings";
const GOVERNANCE_NOEMA_DECISION_AUTHORITY = "exact canonical Noema decision token authority";

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

  it("binds the active commercial authority to exact Commit Status projection, retry chronology, and Noema decision identity", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = currentOpenLaneSection(baseline);
    const row = currentGovernanceRow(baseline);

    expect(section).toContain(CURRENT_730_EXACT);
    expect(section).not.toContain(STALE_730_EXACT);
    expect(section).toContain(STATUS_PROJECTION_AUTHORITY);
    expect(section).toContain(RETRY_CHRONOLOGY_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(section).toContain(NOEMA_DECISION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_CANDIDATE);
    expect(row).toContain(GOVERNANCE_STATUS_PROJECTION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_DECISION_AUTHORITY);
  });
});
