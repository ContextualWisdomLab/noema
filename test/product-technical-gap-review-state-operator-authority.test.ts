import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_SHA = "51d3d1bd77742f5eccf75ce6167faa11cb97f24f";
const CURRENT_730_EXACT = `#730 current exact \`${CURRENT_730_SHA}\``;
const CURRENT_GOVERNANCE_CANDIDATE = `candidate #730 exact \`${CURRENT_730_SHA}\``;
const PRIOR_730_EXACT = "#730 current exact `11f3b6dda190f4a70dcc09951bf2009330f6e320`";
const PRIOR_GOVERNANCE_CANDIDATE = "candidate #730 exact `11f3b6dda190f4a70dcc09951bf2009330f6e320`";
const REVIEW_STATE_OPERATOR_AUTHORITY =
  "active operator guide binds Noema marker decisions to exact GitHub review `state` authority";
const REVIEW_STATE_MAPPING_TEST_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const NOEMA_MARKER_WHITESPACE_AUTHORITY =
  "requires the literal single-line Noema review marker spacing without whitespace normalization";
const NOEMA_MARKER_CARDINALITY_AUTHORITY =
  "requires exactly one marker-like Noema review envelope per trusted review body, requires that envelope to be the one canonical marker, and rejects additional malformed envelopes";
const NOEMA_REVIEW_DISMISSAL_AUTHORITY =
  "treats trusted exact-head `DISMISSED` review state as revocation and never falls back to an older Noema approval";
const GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY =
  "preserves generic reviewer-state projection while malformed credentialed exact-head Noema gate successors revoke prior approval";
const NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY =
  "revokes prior Noema approval when a later trusted exact-head canonical gate marker loses its reviewer credential while preserving ordinary review comments";
const NOEMA_CREDENTIAL_SERIALIZATION_AUTHORITY =
  "requires the literal bullet reviewer credential line plus one blank line immediately before the canonical Noema marker and rejects bare credential lines";
const NOEMA_REVIEW_BASE_AUTHORITY =
  "requires formal Noema review authority to bind the exact evaluated base SHA as publisher-owned serialization and revalidate live state/head/base before publication";
const NOEMA_INJECTED_PUBLISHER_BASE_AUTHORITY =
  "requires the injectable Noema publisher seam to receive the same evaluated base SHA as the production publication path";
const MERGE_BASE_SHA_AUTHORITY =
  "revalidates the freshly evaluated base SHA immediately before the normal merge write";
const EQUAL_TIMESTAMP_RETRY_AUTHORITY =
  "fails closed when distinct same-suite retries have identical observed chronology instead of ordering by opaque Check Run ids";
const APPROVAL_MAPPING = "`approve`→`APPROVED`";
const BLOCKING_MAPPING = "`request_changes`/`blocked`→`CHANGES_REQUESTED`";

function currentOpenLaneSection(baseline: string): string {
  const start = baseline.indexOf(CURRENT_OPEN_LANE_HEADING);
  if (start < 0) {
    return "";
  }
  const nextHeading = baseline.indexOf("\n## ", start + CURRENT_OPEN_LANE_HEADING.length);
  return baseline.slice(start, nextHeading === -1 ? baseline.length : nextHeading);
}

function protectedMainGovernanceRow(baseline: string): string {
  return baseline
    .split("\n")
    .find((line) => line.startsWith("| P0 | Protected-main governance closure |")) ?? "";
}

function hasExactReviewStateMappings(baseline: string): boolean {
  const active = currentOpenLaneSection(baseline);
  return active.includes(APPROVAL_MAPPING) && active.includes(BLOCKING_MAPPING);
}

/** Requires one current #730 identity in each live authority location, rejecting every stale duplicate. */
function hasUniqueCurrent730Identity(baseline: string): boolean {
  const active = currentOpenLaneSection(baseline);
  const governanceRow = protectedMainGovernanceRow(baseline);
  const activeIdentities = [...active.matchAll(/#730 current exact `([0-9a-f]{40})`/g)]
    .map((match) => match[1]);
  const governanceCandidates = [...governanceRow.matchAll(/candidate #730 exact `([0-9a-f]{40})`/g)]
    .map((match) => match[1]);

  return activeIdentities.length === 1
    && activeIdentities[0] === CURRENT_730_SHA
    && governanceCandidates.length === 1
    && governanceCandidates[0] === CURRENT_730_SHA;
}

describe("product-technical gap review-state operator authority", () => {
  it("binds the active commercial baseline to the current #730 review and merge-write contracts", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(hasUniqueCurrent730Identity(baseline)).toBe(true);
    expect(baseline).toContain(REVIEW_STATE_OPERATOR_AUTHORITY);
    expect(baseline).toContain(REVIEW_STATE_MAPPING_TEST_AUTHORITY);
    expect(baseline).toContain(NOEMA_DECISION_AUTHORITY);
    expect(baseline).toContain(NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(baseline).toContain(NOEMA_MARKER_WHITESPACE_AUTHORITY);
    expect(baseline).toContain(NOEMA_MARKER_CARDINALITY_AUTHORITY);
    expect(baseline).toContain(NOEMA_REVIEW_DISMISSAL_AUTHORITY);
    expect(baseline).toContain(GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY);
    expect(baseline).toContain(NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY);
    expect(baseline).toContain(NOEMA_CREDENTIAL_SERIALIZATION_AUTHORITY);
    expect(baseline).toContain(NOEMA_REVIEW_BASE_AUTHORITY);
    expect(baseline).toContain(NOEMA_INJECTED_PUBLISHER_BASE_AUTHORITY);
    expect(baseline).toContain(MERGE_BASE_SHA_AUTHORITY);
    expect(baseline).toContain(EQUAL_TIMESTAMP_RETRY_AUTHORITY);
    expect(hasExactReviewStateMappings(baseline)).toBe(true);
  });

  it("rejects duplicate prior #730 identities in both active authority locations", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const hostile = baseline
      .replace(CURRENT_730_EXACT, `${CURRENT_730_EXACT}; ${PRIOR_730_EXACT}`)
      .replace(
        CURRENT_GOVERNANCE_CANDIDATE,
        `${CURRENT_GOVERNANCE_CANDIDATE}; ${PRIOR_GOVERNANCE_CANDIDATE}`,
      );

    expect(hasUniqueCurrent730Identity(hostile)).toBe(false);
  });

  it("does not let swapped or missing marker-to-state authority satisfy the active open-lane section", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const active = currentOpenLaneSection(baseline);
    const swapped = active
      .replace(APPROVAL_MAPPING, "`approve`→`CHANGES_REQUESTED`")
      .replace(BLOCKING_MAPPING, "`request_changes`/`blocked`→`APPROVED`");
    const missingApprovalMapping = active.replace(APPROVAL_MAPPING, "");
    const missingBlockingMapping = active.replace(BLOCKING_MAPPING, "");

    expect(hasExactReviewStateMappings(swapped)).toBe(false);
    expect(hasExactReviewStateMappings(missingApprovalMapping)).toBe(false);
    expect(hasExactReviewStateMappings(missingBlockingMapping)).toBe(false);
  });

  it("does not let historical duplicate mappings mask their removal from the active open-lane section", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const start = baseline.indexOf(CURRENT_OPEN_LANE_HEADING);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = baseline.indexOf("\n## ", start + CURRENT_OPEN_LANE_HEADING.length);
    const boundedEnd = end === -1 ? baseline.length : end;
    const active = baseline.slice(start, boundedEnd)
      .replace(APPROVAL_MAPPING, "")
      .replace(BLOCKING_MAPPING, "");
    const hostile = [
      APPROVAL_MAPPING,
      BLOCKING_MAPPING,
      baseline.slice(0, start),
      active,
      baseline.slice(boundedEnd),
    ].join("\n");

    expect(hasExactReviewStateMappings(hostile)).toBe(false);
  });
});
