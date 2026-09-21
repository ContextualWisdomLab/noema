import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONVERGENCE_HEADING = "## Protected private-reporting authority convergence — merged PRs #722 + #723 + #724";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `ce5a84df726e59e35f113f86578b3b1e55880ddf`";
const GOVERNANCE_NEXT_ACTION =
  "#730 current-head independent review + hosted gates 종료 후 normal merge 검토";
const PRIVATE_REPORTING_ROW_PREFIX = "| P0 | Private vulnerability reporting operational evidence |";
const PRIVATE_REPORTING_DATED_VISIBILITY =
  "dated 2026-09-22 signed-out `Report a vulnerability` visibility + bounded public observation evidenced";
const PRIVATE_REPORTING_REMAINING_GAPS =
  "direct submission form, fresh protected receipt, staffing/notification, benign private case, release/deployment evidence open";
const PRIVATE_REPORTING_NEXT_ACTION =
  "#73에서 fresh protected receipt, direct submission form, staffing/notification, benign private case, buyer-safe receipt를 owner별로 독립 수집";

/**
 * Isolates the dated convergence authority so duplicated historical text cannot satisfy current-evidence assertions.
 */
function convergenceSection(baseline: string) {
  const start = baseline.indexOf(CONVERGENCE_HEADING);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextHeading = baseline.indexOf("\n## ", start + CONVERGENCE_HEADING.length);
  return baseline.slice(start, nextHeading === -1 ? baseline.length : nextHeading);
}

/**
 * Requires one commercial governance row to carry both candidate identity and next action.
 *
 * Historical prose elsewhere in the baseline is predecessor evidence only and
 * must not satisfy the current P0 register contract.
 */
function hasCurrentGovernanceCandidate(baseline: string): boolean {
  const governanceRows = baseline
    .split("\n")
    .filter((line) => line.startsWith(GOVERNANCE_ROW_PREFIX));
  return governanceRows.length === 1
    && governanceRows[0].includes(GOVERNANCE_CANDIDATE)
    && governanceRows[0].includes(GOVERNANCE_NEXT_ACTION);
}

/**
 * Requires the active private-reporting P0 row itself to carry the newest dated
 * reporter-surface observation and the still-open operational evidence classes.
 */
function hasCurrentPrivateReportingObservation(baseline: string): boolean {
  const privateReportingRows = baseline
    .split("\n")
    .filter((line) => line.startsWith(PRIVATE_REPORTING_ROW_PREFIX));
  return privateReportingRows.length === 1
    && privateReportingRows[0].includes(PRIVATE_REPORTING_DATED_VISIBILITY)
    && privateReportingRows[0].includes(PRIVATE_REPORTING_REMAINING_GAPS)
    && privateReportingRows[0].includes(PRIVATE_REPORTING_NEXT_ACTION);
}

describe("product-technical gap current authority", () => {
  it("records protected private-reporting history and post-#728 downstream authority inside the dated convergence section", () => {
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
    expect(section).toContain("#728 is protected history, not an open candidate");
    expect(section).not.toContain("PR #728 exact `5deb783fd0985f374630112a92b921bb2f420356`");
  });

  it("records the current protected-main governance candidate in the commercial gap register", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(hasCurrentGovernanceCandidate(baseline)).toBe(true);
  });

  it("does not let duplicated historical prose satisfy current governance-row authority", () => {
    const hostileBaseline = [
      `Historical predecessor note: ${GOVERNANCE_CANDIDATE}`,
      `Historical predecessor next step: ${GOVERNANCE_NEXT_ACTION}`,
      `${GOVERNANCE_ROW_PREFIX} Security workflow 하나로 통제를 과대 주장할 위험 | issue #27 | external control evidence open | live ruleset evidence | admin/owner control을 독립 검증 |`,
    ].join("\n");

    expect(hasCurrentGovernanceCandidate(hostileBaseline)).toBe(false);
  });

  it("binds the dated external-reporter observation to the active private-reporting P0 row", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(hasCurrentPrivateReportingObservation(baseline)).toBe(true);
  });

  it("does not let historical reporter-observation prose satisfy the active private-reporting row", () => {
    const hostileBaseline = [
      `Historical observation: ${PRIVATE_REPORTING_DATED_VISIBILITY}`,
      `Historical remaining gaps: ${PRIVATE_REPORTING_REMAINING_GAPS}`,
      `Historical next action: ${PRIVATE_REPORTING_NEXT_ACTION}`,
      `${PRIVATE_REPORTING_ROW_PREFIX} setting receipt가 운영 증거로 과대 승격될 위험 | issue #73; candidate #726 | external reporter visibility open | protected observation | collect remaining evidence |`,
    ].join("\n");

    expect(hasCurrentPrivateReportingObservation(hostileBaseline)).toBe(false);
  });

  it("keeps release observation current without promoting absence into release completion", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("Dated release observation for this repair (2026-09-21 KST)는 GitHub Releases **0건**이다.");
    expect(baseline).not.toContain("Dated release observation for this repair (2026-09-16 KST)는 GitHub Releases **0건**이다.");
    expect(baseline).toContain("GitHub release collection에 immutable Noema release가 실제 존재하기 전");
  });
});
