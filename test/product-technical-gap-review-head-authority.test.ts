import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `e7ec8d0dc71d31342f0514fef5578f04123caa1a`";
const STALE_730_EXACT = "#730 current exact `f8bf13702838131bcc586757348ef4a74564d9a1`";
const REVIEW_HEAD_AUTHORITY =
  "requires GitHub review `commit_id` to equal the exact current head before a Noema decision can become merge authority";
const REVIEW_GUIDE_AUTHORITY =
  "active operator guide documents the exact review-to-head `commit_id` binding and its fail-closed diagnostic";
const REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "requires repository workflow URL id to equal the workflow run's `workflow_id`";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `e7ec8d0dc71d31342f0514fef5578f04123caa1a`";
const GOVERNANCE_REVIEW_HEAD_AUTHORITY = "exact review-to-head `commit_id` binding";
const GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "repository workflow URL/workflow_id identity consistency";

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
  it("binds active #730 authority to GitHub review commit identity and repository workflow identity", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = currentOpenLaneSection(baseline);
    const row = currentGovernanceRow(baseline);

    expect(section).toContain(CURRENT_730_EXACT);
    expect(section).not.toContain(STALE_730_EXACT);
    expect(section).toContain(REVIEW_HEAD_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_AUTHORITY);
    expect(section).toContain(REPOSITORY_WORKFLOW_ID_AUTHORITY);
    expect(row).toContain(GOVERNANCE_CANDIDATE);
    expect(row).toContain(GOVERNANCE_REVIEW_HEAD_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY);
  });
});
