import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `c23b3d186925e63a11f6777139995d37fce190ef`";
const STALE_730_EXACT = "#730 current exact `b6cb069ffb8c498a9d096f5209f5d0ac93400ce6`";
const STATUS_PROJECTION_AUTHORITY =
  "preserves exact Commit Status context/state identity before terminal merge-authority evaluation";
const RETRY_CHRONOLOGY_AUTHORITY =
  "fails closed when same-suite retry chronology lacks parseable `started_at`/`completed_at` evidence";
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const MERGE_BASE_SHA_AUTHORITY =
  "revalidates the freshly evaluated base SHA immediately before the normal merge write";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `c23b3d186925e63a11f6777139995d37fce190ef`";
const GOVERNANCE_STATUS_PROJECTION_AUTHORITY = "exact Commit Status collection projection identity";
const GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY = "fail-closed unknown retry chronology";
const GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY =
  "independently rejects missing approval and missing blocking marker-to-state mappings";
const GOVERNANCE_NOEMA_DECISION_AUTHORITY = "exact canonical Noema decision token authority";
const GOVERNANCE_NOEMA_MARKER_SERIALIZATION_AUTHORITY = "exact Noema review marker serialization authority";
const GOVERNANCE_MERGE_BASE_SHA_AUTHORITY = "fresh-evaluated base-SHA merge-write revalidation";

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

  it("binds the active commercial authority to exact result, review, and merge-write identity", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = currentOpenLaneSection(baseline);
    const row = currentGovernanceRow(baseline);

    expect(section).toContain(CURRENT_730_EXACT);
    expect(section).not.toContain(STALE_730_EXACT);
    expect(section).toContain(STATUS_PROJECTION_AUTHORITY);
    expect(section).toContain(RETRY_CHRONOLOGY_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(section).toContain(NOEMA_DECISION_AUTHORITY);
    expect(section).toContain(NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(section).toContain(MERGE_BASE_SHA_AUTHORITY);
    expect(row).toContain(GOVERNANCE_CANDIDATE);
    expect(row).toContain(GOVERNANCE_STATUS_PROJECTION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_DECISION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_MERGE_BASE_SHA_AUTHORITY);
  });
});
