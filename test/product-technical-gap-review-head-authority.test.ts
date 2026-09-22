import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `c9ed50e380d4498a4386a1b28c440aa4414991e6`";
const STALE_730_EXACT = "#730 current exact `8146360fc10ce23da50344d605138a4d783d77e5`";
const REVIEW_HEAD_AUTHORITY =
  "requires GitHub review `commit_id` to equal the exact current head before a Noema decision can become merge authority";
const REVIEW_STATE_AUTHORITY =
  "requires exact GitHub review state authority without case normalization";
const REVIEW_GUIDE_AUTHORITY =
  "active operator guide documents the exact review-to-head `commit_id` binding and its fail-closed diagnostic";
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "requires repository workflow URL id to equal the workflow run's `workflow_id`";
const STATUS_PROJECTION_AUTHORITY =
  "preserves exact Commit Status context/state identity before terminal merge-authority evaluation";
const RETRY_CHRONOLOGY_AUTHORITY =
  "fails closed when same-suite retry chronology lacks parseable `started_at`/`completed_at` evidence";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `c9ed50e380d4498a4386a1b28c440aa4414991e6`";
const GOVERNANCE_REVIEW_HEAD_AUTHORITY = "exact review-to-head `commit_id` binding";
const GOVERNANCE_REVIEW_STATE_AUTHORITY = "exact GitHub review state authority";
const GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY =
  "independently rejects missing approval and missing blocking marker-to-state mappings";
const GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "repository workflow URL/workflow_id identity consistency";
const GOVERNANCE_STATUS_PROJECTION_AUTHORITY = "exact Commit Status collection projection identity";
const GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY = "fail-closed unknown retry chronology";

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

describe("product-technical gap review-head authority", () => {
  it("binds active #730 authority to review identity/state, workflow identity, status projection, and retry chronology", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = currentOpenLaneSection(baseline);
    const row = currentGovernanceRow(baseline);

    expect(section).toContain(CURRENT_730_EXACT);
    expect(section).not.toContain(STALE_730_EXACT);
    expect(section).toContain(REVIEW_HEAD_AUTHORITY);
    expect(section).toContain(REVIEW_STATE_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(section).toContain(REPOSITORY_WORKFLOW_ID_AUTHORITY);
    expect(section).toContain(STATUS_PROJECTION_AUTHORITY);
    expect(section).toContain(RETRY_CHRONOLOGY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_CANDIDATE);
    expect(row).toContain(GOVERNANCE_REVIEW_HEAD_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REVIEW_STATE_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY);
    expect(row).toContain(GOVERNANCE_STATUS_PROJECTION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY);
  });
});