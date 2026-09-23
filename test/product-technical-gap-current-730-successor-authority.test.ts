import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const COMMERCIAL_GAP_HEADING = "## Commercial gap register";
const CURRENT_730_EXACT = "11f3b6dda190f4a70dcc09951bf2009330f6e320";
const CURRENT_MARKER = `#730 current exact \`${CURRENT_730_EXACT}\``;
const CURRENT_CANDIDATE = `candidate #730 exact \`${CURRENT_730_EXACT}\``;
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const NOEMA_MARKER_WHITESPACE_AUTHORITY =
  "requires the literal single-line Noema review marker spacing without whitespace normalization";
const NOEMA_MARKER_CARDINALITY_AUTHORITY =
  "requires exactly one marker-like Noema review envelope per trusted review body, requires that envelope to be the one canonical marker, and rejects additional malformed envelopes";
const NOEMA_MARKER_CASE_ENVELOPE_AUTHORITY =
  "counts case-variant marker-like Noema envelopes as ambiguity while keeping canonical marker validation case-sensitive";
const NOEMA_REVIEWER_LOGIN_AUTHORITY =
  "requires exact configured Noema reviewer login identity without case folding";
const NOEMA_REVIEW_DISMISSAL_AUTHORITY =
  "treats trusted exact-head `DISMISSED` review state as revocation and never falls back to an older Noema approval";
const GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY =
  "preserves generic reviewer-state projection while malformed credentialed exact-head Noema gate successors revoke prior approval";
const NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY =
  "revokes prior Noema approval when a later trusted exact-head canonical gate marker loses its reviewer credential while preserving ordinary review comments";
const NOEMA_CREDENTIAL_POSITION_AUTHORITY =
  "requires reviewer credential authority at the canonical marker-adjacent publisher position so earlier body echoes cannot mask a missing or different publisher credential";
const NOEMA_CREDENTIAL_SERIALIZATION_AUTHORITY =
  "requires the literal bullet reviewer credential line plus one blank line immediately before the canonical Noema marker and rejects bare credential lines";
const NOEMA_REVIEW_BASE_AUTHORITY =
  "requires formal Noema review authority to bind the exact evaluated base SHA as publisher-owned serialization and revalidate live state/head/base before publication";
const MERGE_BASE_SHA_AUTHORITY =
  "revalidates the freshly evaluated base SHA immediately before the normal merge write";
const PRODUCTION_DOCSTRING_AUTHORITY =
  "100% 38-function authority-bearing production docstring scope contract";
const HOSTED_RED_TEST_CONTRACT_AUTHORITY =
  "hosted RED test-contract RCA preserves missing-approval versus explicit-rejection semantics, fail-closed missing retry chronology, and the 38-function direct-JSDoc gate without changing production merge authority";
const EQUAL_TIMESTAMP_RETRY_AUTHORITY =
  "fails closed when distinct same-suite retries have identical observed chronology instead of ordering by opaque Check Run ids";
const CHANGELOG_AUTHORITY =
  "CHANGELOG `## Unreleased` records the #730 authority-bearing behavior without promoting source evidence to release authority";
const STALE_OPAQUE_ID_TIE_BREAKER_AUTHORITY =
  "opaque check-run ids are only deterministic tie-breakers after valid temporal evidence exists";
const CURRENT_OPAQUE_ID_AUTHORITY =
  "opaque Check Run ids are not chronology authority when observed retry timestamps are equal";

const activeAuthorities = [
  CURRENT_MARKER,
  REVIEW_GUIDE_MUTATION_AUTHORITY,
  NOEMA_DECISION_AUTHORITY,
  NOEMA_MARKER_SERIALIZATION_AUTHORITY,
  NOEMA_MARKER_WHITESPACE_AUTHORITY,
  NOEMA_MARKER_CARDINALITY_AUTHORITY,
  NOEMA_MARKER_CASE_ENVELOPE_AUTHORITY,
  NOEMA_REVIEWER_LOGIN_AUTHORITY,
  NOEMA_REVIEW_DISMISSAL_AUTHORITY,
  GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY,
  NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY,
  NOEMA_CREDENTIAL_POSITION_AUTHORITY,
  NOEMA_CREDENTIAL_SERIALIZATION_AUTHORITY,
  NOEMA_REVIEW_BASE_AUTHORITY,
  MERGE_BASE_SHA_AUTHORITY,
  PRODUCTION_DOCSTRING_AUTHORITY,
  HOSTED_RED_TEST_CONTRACT_AUTHORITY,
  EQUAL_TIMESTAMP_RETRY_AUTHORITY,
  CHANGELOG_AUTHORITY,
  CURRENT_OPAQUE_ID_AUTHORITY,
];

const authoritySources = [
  "test/product-technical-gap-current-authority.test.ts",
  "test/product-technical-gap-post-726-merge-authority.test.ts",
  "test/product-technical-gap-review-head-authority.test.ts",
  "test/product-technical-gap-review-state-operator-authority.test.ts",
  "test/product-technical-gap-commit-status-projection-authority.test.ts",
];

function currentOpenLaneSection(baseline: string): string {
  const start = baseline.indexOf(CURRENT_OPEN_LANE_HEADING);
  if (start < 0) {
    return "";
  }
  const end = baseline.indexOf(`\n${COMMERCIAL_GAP_HEADING}`, start + CURRENT_OPEN_LANE_HEADING.length);
  return baseline.slice(start, end === -1 ? baseline.length : end);
}

function protectedMainGovernanceRow(baseline: string): string {
  return baseline
    .split("\n")
    .find((line) => line.startsWith("| P0 | Protected-main governance closure |")) ?? "";
}

/** Prevents historical prose or another P0 row from satisfying current #730 authority. */
function hasCurrent730SuccessorAuthority(baseline: string): boolean {
  const active = currentOpenLaneSection(baseline);
  const governanceRow = protectedMainGovernanceRow(baseline);
  return activeAuthorities.every((authority) => active.includes(authority))
    && governanceRow.includes(CURRENT_CANDIDATE)
    && !active.includes(STALE_OPAQUE_ID_TIE_BREAKER_AUTHORITY);
}

describe("commercial baseline follows the current #730 successor", () => {
  it("binds the active baseline and governance row to the exact current #730 head", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(hasCurrent730SuccessorAuthority(baseline)).toBe(true);
  });

  it("does not let historical prose satisfy a missing current #730 marker", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const active = currentOpenLaneSection(baseline);
    expect(active).toContain(CURRENT_MARKER);
    const withoutCurrentMarker = active.replace(CURRENT_MARKER, "");
    const hostile = baseline.replace(active, withoutCurrentMarker).replace(
      CURRENT_OPEN_LANE_HEADING,
      `${CURRENT_MARKER}\n${CURRENT_OPEN_LANE_HEADING}`,
    );

    expect(hasCurrent730SuccessorAuthority(hostile)).toBe(false);
  });

  it("moves every changed authority fixture to the same current #730 exact", () => {
    for (const path of authoritySources) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain(CURRENT_730_EXACT);
    }
  });
});
