import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `3c315332ba40230495bf4a57c3b6dee96b394992`";
const STALE_730_EXACT = "#730 current exact `c8b776797f78f7440f6a96fb232efb9182d9a0a7`";
const REVIEW_HEAD_AUTHORITY =
  "requires GitHub review `commit_id` to equal the exact current head before a Noema decision can become merge authority";
const REVIEW_STATE_AUTHORITY =
  "requires exact GitHub review state authority without case normalization";
const REVIEW_GUIDE_AUTHORITY =
  "active operator guide documents the exact review-to-head `commit_id` binding and its fail-closed diagnostic";
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const NOEMA_MARKER_CARDINALITY_AUTHORITY =
  "requires exactly one canonical Noema review marker per trusted review body and rejects duplicate or conflicting markers";
const MERGE_BASE_SHA_AUTHORITY =
  "revalidates the freshly evaluated base SHA immediately before the normal merge write";
const REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "requires repository workflow URL id to equal the workflow run's `workflow_id`";
const STATUS_PROJECTION_AUTHORITY =
  "preserves exact Commit Status context/state identity before terminal merge-authority evaluation";
const RETRY_CHRONOLOGY_AUTHORITY =
  "fails closed when same-suite retry chronology lacks parseable `started_at`/`completed_at` evidence";
const EQUAL_TIMESTAMP_RETRY_AUTHORITY =
  "fails closed when distinct same-suite retries have identical observed chronology instead of ordering by opaque Check Run ids";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `3c315332ba40230495bf4a57c3b6dee96b394992`";
const GOVERNANCE_REVIEW_HEAD_AUTHORITY = "exact review-to-head `commit_id` binding";
const GOVERNANCE_REVIEW_STATE_AUTHORITY = "exact GitHub review state authority";
const GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY =
  "independently rejects missing approval and missing blocking marker-to-state mappings";
const GOVERNANCE_NOEMA_DECISION_AUTHORITY = "exact canonical Noema decision token authority";
const GOVERNANCE_NOEMA_MARKER_SERIALIZATION_AUTHORITY = "exact Noema review marker serialization authority";
const GOVERNANCE_NOEMA_MARKER_CARDINALITY_AUTHORITY = "exact-one Noema review marker cardinality authority";
const GOVERNANCE_MERGE_BASE_SHA_AUTHORITY = "fresh-evaluated base-SHA merge-write revalidation";
const GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "repository workflow URL/workflow_id identity consistency";
const GOVERNANCE_STATUS_PROJECTION_AUTHORITY = "exact Commit Status collection projection identity";
const GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY = "fail-closed unknown retry chronology";
const GOVERNANCE_EQUAL_TIMESTAMP_RETRY_AUTHORITY = "fail-closed equal-timestamp retry ambiguity";

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
  it("binds active #730 authority to current review, workflow, result, and merge-write identities", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = currentOpenLaneSection(baseline);
    const row = currentGovernanceRow(baseline);

    expect(section).toContain(CURRENT_730_EXACT);
    expect(section).not.toContain(STALE_730_EXACT);
    expect(section).toContain(REVIEW_HEAD_AUTHORITY);
    expect(section).toContain(REVIEW_STATE_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(section).toContain(NOEMA_DECISION_AUTHORITY);
    expect(section).toContain(NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(section).toContain(NOEMA_MARKER_CARDINALITY_AUTHORITY);
    expect(section).toContain(MERGE_BASE_SHA_AUTHORITY);
    expect(section).toContain(REPOSITORY_WORKFLOW_ID_AUTHORITY);
    expect(section).toContain(STATUS_PROJECTION_AUTHORITY);
    expect(section).toContain(RETRY_CHRONOLOGY_AUTHORITY);
    expect(section).toContain(EQUAL_TIMESTAMP_RETRY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_CANDIDATE);
    expect(row).toContain(GOVERNANCE_REVIEW_HEAD_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REVIEW_STATE_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_DECISION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_MARKER_CARDINALITY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_MERGE_BASE_SHA_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY);
    expect(row).toContain(GOVERNANCE_STATUS_PROJECTION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_EQUAL_TIMESTAMP_RETRY_AUTHORITY);
  });
});