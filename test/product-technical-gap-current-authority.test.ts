import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONVERGENCE_HEADING = "## Protected private-reporting authority convergence — merged PRs #722 + #723 + #724";
const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_PROTECTED_MAIN = "main@ca32ae2eb8c5ce73af2769d6a58a7ac714503251";
const MERGED_726 = "PR #726 GitHub-verified normal merge `ca32ae2eb8c5ce73af2769d6a58a7ac714503251`";
const MERGED_727 = "PR #727 GitHub-verified normal merge `c3a3a42170ac06fbfc5c1a3b32e34827d967b5c9`";
const OPEN_726 = "#726 current exact `d32a054c361eb9e9ad6e563d4956d8586ed7d38f`";
const OPEN_727 = "#727 current exact `a5ad6f421c710e6faf7e4471da1ebc78aa3b0ec5`";
const CURRENT_730_EXACT = "#730 current exact `e4ccde409f1792df9842548cca0dd3f9e7e70530`";
const STALE_730_EXACT = "#730 current exact `b131ee030fca8cf66050023a270d7375b246d352`";
const CURRENT_730_PR_BOUND_PROVENANCE =
  "requires one explicit `pull_requests` association matching target PR number, exact head SHA, canonical base ref `main`, and exact current base SHA";
const CURRENT_730_CHECK_NAME_AUTHORITY =
  "requires exact required check-name identity without whitespace normalization";
const CURRENT_730_PRODUCER_AUTHORITY =
  "requires exact GitHub Actions producer identity without trim/case normalization";
const CURRENT_730_CHECK_SUITE_IDENTITY_AUTHORITY =
  "requires exact check-suite retry grouping without check-name or producer normalization and timestamp-first retry chronology before opaque check-run ids";
const CURRENT_730_RETRY_CHRONOLOGY_AUTHORITY =
  "fails closed when same-suite retry chronology lacks parseable `started_at`/`completed_at` evidence";
const CURRENT_730_APP_ID_AUTHORITY =
  "requires canonical GitHub Actions App id `15368` from the Noema owner contract";
const CURRENT_730_PR_IDENTITY_AUTHORITY =
  "requires exact pull-request state/base/repository/head SHA/mergeable-state identity without whitespace normalization";
const CURRENT_730_REQUIRED_WORKFLOW_SOURCE_AUTHORITY =
  "requires required-workflow id to resolve through live organization rules and source repository metadata";
const CURRENT_730_REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "requires repository workflow URL id to equal the workflow run's `workflow_id`";
const CURRENT_730_OPERATOR_GUIDE_AUTHORITY =
  "active operator guide explicitly requires target repository workflow URL id to equal the workflow-run `workflow_id` and fail closed as `untrusted-workflow`";
const CURRENT_730_OPERATOR_DIAGNOSTIC_AUTHORITY =
  "active `required_check_missing` operator diagnostic covers the full fail-closed provenance tuple";
const CURRENT_730_REVIEW_STATE_OPERATOR_AUTHORITY =
  "active operator guide binds Noema marker decisions to exact GitHub review `state` authority";
const CURRENT_730_CHECK_RESULT_AUTHORITY =
  "requires exact Check Run status/conclusion and Commit Status state authority without whitespace or case normalization";
const CURRENT_730_STATUS_PROJECTION_AUTHORITY =
  "preserves exact Commit Status context/state identity before terminal merge-authority evaluation";
const CURRENT_730_STATUS_ORDER_AUTHORITY =
  "preserves GitHub REST reverse-chronological Commit Status order without synthesized timestamp/id chronology";
const CURRENT_730_REVIEW_ORDER_AUTHORITY =
  "preserves GitHub REST review-list chronology without synthesized `submitted_at`/id ordering";
const CURRENT_730_PRODUCTION_DOCSTRING_AUTHORITY =
  "100% 36-function authority-bearing production docstring scope contract";
const CURRENT_GOVERNANCE_CONTROL_PLANE_AUTHORITY =
  "Issue #27 remains live repository governance authority for ruleset, pull-request, review/conversation, history, deletion, and bypass control-plane evidence";
const CURRENT_REVIEWER_APP_AUTHORITY =
  "Reviewer/Maintainer App identity and eligibility remain separate issue #29 authority under ADR-0011";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `e4ccde409f1792df9842548cca0dd3f9e7e70530`";
const GOVERNANCE_CONTROL_PLANE_OWNER =
  "issue #27 retains ruleset/pull-request/review/conversation/history/deletion/bypass control-plane authority";
const GOVERNANCE_PRODUCER_AUTHORITY = "exact required check producer identity";
const GOVERNANCE_CHECK_SUITE_IDENTITY_AUTHORITY = "exact check-suite retry identity + timestamp-first retry chronology";
const GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY = "fail-closed unknown retry chronology";
const GOVERNANCE_APP_ID_AUTHORITY = "canonical GitHub Actions App id";
const GOVERNANCE_PR_IDENTITY_AUTHORITY = "exact pull-request identity authority";
const GOVERNANCE_REQUIRED_WORKFLOW_SOURCE_AUTHORITY = "canonical required-workflow source authority";
const GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "repository workflow URL/workflow_id identity consistency";
const GOVERNANCE_OPERATOR_GUIDE_REPOSITORY_WORKFLOW_ID_AUTHORITY =
  "operator guide repository-workflow URL/workflow_id binding";
const GOVERNANCE_OPERATOR_DIAGNOSTIC_AUTHORITY =
  "complete required-check operator diagnostic";
const GOVERNANCE_REVIEW_STATE_OPERATOR_AUTHORITY = "exact review-state operator contract";
const GOVERNANCE_CHECK_RESULT_AUTHORITY =
  "exact Check Run/Commit Status terminal result authority";
const GOVERNANCE_STATUS_PROJECTION_AUTHORITY = "exact Commit Status collection projection identity";
const GOVERNANCE_STATUS_ORDER_AUTHORITY = "GitHub REST Commit Status reverse-chronological order authority";
const GOVERNANCE_REVIEW_ORDER_AUTHORITY = "GitHub REST review-list chronology authority";
const GOVERNANCE_PRODUCTION_DOCSTRING_AUTHORITY =
  "100% 36-function authority-bearing production docstring scope contract";
const GOVERNANCE_NEXT_ACTION =
  "#730 current-head independent review + hosted gates 종료 후 normal merge 검토";
const PRIVATE_REPORTING_ROW_PREFIX = "| P0 | Private vulnerability reporting operational evidence |";
const PRIVATE_REPORTING_PROTECTED_OWNER = "protected #722 + #723 + #724 + #726 / issue #73";
const PRIVATE_REPORTING_DATED_VISIBILITY =
  "dated 2026-09-22 signed-out `Report a vulnerability` visibility + bounded public observation evidenced";
const PRIVATE_REPORTING_REMAINING_GAPS =
  "direct submission form, fresh protected receipt, staffing/notification, benign private case, release/deployment evidence open";
const PRIVATE_REPORTING_NEXT_ACTION =
  "#73에서 fresh protected receipt, direct submission form, staffing/notification, benign private case, buyer-safe receipt를 owner별로 독립 수집";

/** Isolates the dated convergence authority so historical text cannot satisfy current-evidence assertions. */
function convergenceSection(baseline: string) {
  const start = baseline.indexOf(CONVERGENCE_HEADING);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextHeading = baseline.indexOf("\n## ", start + CONVERGENCE_HEADING.length);
  return baseline.slice(start, nextHeading === -1 ? baseline.length : nextHeading);
}

/** Isolates live open-lane authority from dated convergence history. */
function currentOpenLaneSection(baseline: string) {
  const start = baseline.indexOf(CURRENT_OPEN_LANE_HEADING);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextHeading = baseline.indexOf("\n## ", start + CURRENT_OPEN_LANE_HEADING.length);
  return baseline.slice(start, nextHeading === -1 ? baseline.length : nextHeading);
}

/** Requires one commercial governance row to carry candidate identity and current authority. */
function hasCurrentGovernanceCandidate(baseline: string): boolean {
  const governanceRows = baseline.split("\n").filter((line) => line.startsWith(GOVERNANCE_ROW_PREFIX));
  return governanceRows.length === 1
    && governanceRows[0].includes(GOVERNANCE_CANDIDATE)
    && governanceRows[0].includes(GOVERNANCE_CONTROL_PLANE_OWNER)
    && governanceRows[0].includes(GOVERNANCE_PRODUCER_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_CHECK_SUITE_IDENTITY_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_APP_ID_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_PR_IDENTITY_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_REQUIRED_WORKFLOW_SOURCE_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_REPOSITORY_WORKFLOW_ID_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_OPERATOR_GUIDE_REPOSITORY_WORKFLOW_ID_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_OPERATOR_DIAGNOSTIC_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_REVIEW_STATE_OPERATOR_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_CHECK_RESULT_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_STATUS_PROJECTION_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_STATUS_ORDER_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_REVIEW_ORDER_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_PRODUCTION_DOCSTRING_AUTHORITY)
    && governanceRows[0].includes(GOVERNANCE_NEXT_ACTION);
}

/** Requires the private-reporting row to reflect protected integration while keeping operational gaps open. */
function hasCurrentPrivateReportingObservation(baseline: string): boolean {
  const rows = baseline.split("\n").filter((line) => line.startsWith(PRIVATE_REPORTING_ROW_PREFIX));
  return rows.length === 1
    && rows[0].includes(PRIVATE_REPORTING_PROTECTED_OWNER)
    && rows[0].includes(PRIVATE_REPORTING_DATED_VISIBILITY)
    && rows[0].includes(PRIVATE_REPORTING_REMAINING_GAPS)
    && rows[0].includes(PRIVATE_REPORTING_NEXT_ACTION)
    && !rows[0].includes("candidate #726");
}

describe("product-technical gap current authority", () => {
  it("records protected private-reporting history and the latest protected-main merge authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = convergenceSection(baseline);

    expect(section).toContain(CONVERGENCE_HEADING);
    expect(section).toContain("PR `#722` reviewed source exact `b4563512dce9ce9084548cad29f247911949c359`");
    expect(section).toContain("PR `#722` GitHub-verified normal merge `227e746662d29dcc8fe360f055b7fdb7857c09fd`");
    expect(section).toContain("PR `#723` reviewed source exact `d73a281add7081ff85dc27dc9312d30b20b39c0e`");
    expect(section).toContain("PR `#723` GitHub-verified normal merge `73bba82c1df315d0b5c6acf2c876f08a3afff708`");
    expect(section).toContain("PR `#724` reviewed source exact `fc0afaf87cc24a9a54a71078324fd9486f4bc929`");
    expect(section).toContain("PR `#724` GitHub-verified normal merge `a69bfadb9a450a37a810a71d4070d652e23d3d60`");
    expect(section).toContain("PR `#728` reviewed source exact `5deb783fd0985f374630112a92b921bb2f420356`");
    expect(section).toContain("PR `#728` GitHub-verified normal merge `8271351d45e28488ab55e759bd7af2c5a31e0218`");
    expect(section).toContain("Dated downstream observation after #728 integration on 2026-09-21 KST");
    expect(section).toContain("main@8271351d45e28488ab55e759bd7af2c5a31e0218");
    expect(section).toContain("ordinary/non-force descendants");
    expect(section).toContain("PR #726 exact `1f5a5a120ea803184649e24e0ad6fc7b3419df63`");
    expect(section).toContain("PR #727 exact `a5ad6f421c710e6faf7e4471da1ebc78aa3b0ec5`");
    expect(section).toContain(MERGED_727);
    expect(section).toContain(MERGED_726);
    expect(section).toContain(CURRENT_PROTECTED_MAIN);
    expect(section).toContain("Issues #27/#29 own enforceable review/App-governance closure");
  });

  it("keeps merged #726 out of the active open-lane section and binds current #730", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const section = currentOpenLaneSection(baseline);

    expect(section).not.toContain(OPEN_726);
    expect(section).not.toContain(OPEN_727);
    expect(section).toContain(CURRENT_730_EXACT);
    expect(section).not.toContain(STALE_730_EXACT);
    expect(section).toContain(CURRENT_730_PR_BOUND_PROVENANCE);
    expect(section).toContain(CURRENT_730_CHECK_NAME_AUTHORITY);
    expect(section).toContain(CURRENT_730_PRODUCER_AUTHORITY);
    expect(section).toContain(CURRENT_730_CHECK_SUITE_IDENTITY_AUTHORITY);
    expect(section).toContain(CURRENT_730_RETRY_CHRONOLOGY_AUTHORITY);
    expect(section).toContain(CURRENT_730_APP_ID_AUTHORITY);
    expect(section).toContain(CURRENT_730_PR_IDENTITY_AUTHORITY);
    expect(section).toContain(CURRENT_730_REQUIRED_WORKFLOW_SOURCE_AUTHORITY);
    expect(section).toContain(CURRENT_730_REPOSITORY_WORKFLOW_ID_AUTHORITY);
    expect(section).toContain(CURRENT_730_OPERATOR_GUIDE_AUTHORITY);
    expect(section).toContain(CURRENT_730_OPERATOR_DIAGNOSTIC_AUTHORITY);
    expect(section).toContain(CURRENT_730_REVIEW_STATE_OPERATOR_AUTHORITY);
    expect(section).toContain(CURRENT_730_CHECK_RESULT_AUTHORITY);
    expect(section).toContain(CURRENT_730_STATUS_PROJECTION_AUTHORITY);
    expect(section).toContain(CURRENT_730_STATUS_ORDER_AUTHORITY);
    expect(section).toContain(CURRENT_730_REVIEW_ORDER_AUTHORITY);
    expect(section).toContain(CURRENT_730_PRODUCTION_DOCSTRING_AUTHORITY);
    expect(section).toContain(CURRENT_GOVERNANCE_CONTROL_PLANE_AUTHORITY);
    expect(section).toContain(CURRENT_REVIEWER_APP_AUTHORITY);
  });

  it("records the current protected-main governance candidate in the commercial gap register", () => {
    expect(hasCurrentGovernanceCandidate(readFileSync("docs/product-technical-gap-baseline.md", "utf8"))).toBe(true);
  });

  it("does not let duplicated historical prose satisfy current governance-row authority", () => {
    const hostileBaseline = [
      `Historical predecessor note: ${GOVERNANCE_CANDIDATE}`,
      `Historical predecessor next step: ${GOVERNANCE_NEXT_ACTION}`,
      `${GOVERNANCE_ROW_PREFIX} Security workflow 하나로 통제를 과대 주장할 위험 | issue #27 | external control evidence open | live ruleset evidence | admin/owner control을 독립 검증 |`,
    ].join("\n");
    expect(hasCurrentGovernanceCandidate(hostileBaseline)).toBe(false);
  });

  it("binds protected #726 source integration and still-open operational evidence to the active row", () => {
    expect(hasCurrentPrivateReportingObservation(readFileSync("docs/product-technical-gap-baseline.md", "utf8"))).toBe(true);
  });

  it("does not let historical reporter-observation prose satisfy the active private-reporting row", () => {
    const hostileBaseline = [
      `Historical observation: ${PRIVATE_REPORTING_DATED_VISIBILITY}`,
      `Historical remaining gaps: ${PRIVATE_REPORTING_REMAINING_GAPS}`,
      `Historical next action: ${PRIVATE_REPORTING_NEXT_ACTION}`,
      `${PRIVATE_REPORTING_ROW_PREFIX} setting receipt가 운영 증거로 과대 승격될 위험 | issue #73 | external reporter visibility open | protected observation | collect remaining evidence |`,
    ].join("\n");
    expect(hasCurrentPrivateReportingObservation(hostileBaseline)).toBe(false);
  });

  it("keeps release observation current without promoting absence into release completion", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    expect(baseline).toContain("Dated release observation for this repair (2026-09-22 KST)는 GitHub Releases **0건**이다.");
    expect(baseline).not.toContain("Dated release observation for this repair (2026-09-21 KST)는 GitHub Releases **0건**이다.");
    expect(baseline).toContain("Fresh 2026-09-23 KST re-read도 GitHub Releases **0건**이다.");
    expect(baseline).toContain("GitHub release collection에 immutable Noema release가 실제 존재하기 전");
  });
});