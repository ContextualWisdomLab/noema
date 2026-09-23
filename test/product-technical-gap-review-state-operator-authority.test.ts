import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `3e7a631c25a8de78c9987181d1e7632c4b091638`";
const STALE_730_EXACT = "#730 current exact `3c315332ba40230495bf4a57c3b6dee96b394992`";
const REVIEW_STATE_OPERATOR_AUTHORITY =
  "active operator guide binds Noema marker decisions to exact GitHub review `state` authority";
const REVIEW_STATE_MAPPING_TEST_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const NOEMA_MARKER_CARDINALITY_AUTHORITY =
  "requires exactly one marker-like Noema review envelope per trusted review body, requires that envelope to be the one canonical marker, and rejects additional malformed envelopes";
const NOEMA_REVIEW_DISMISSAL_AUTHORITY =
  "treats trusted exact-head `DISMISSED` review state as revocation and never falls back to an older Noema approval";
const GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY =
  "preserves generic reviewer-state projection while malformed credentialed exact-head Noema gate successors revoke prior approval";
const NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY =
  "revokes prior Noema approval when a later trusted exact-head canonical gate marker loses its reviewer credential while preserving ordinary review comments";
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

function hasExactReviewStateMappings(baseline: string): boolean {
  const active = currentOpenLaneSection(baseline);
  return active.includes(APPROVAL_MAPPING) && active.includes(BLOCKING_MAPPING);
}

describe("product-technical gap review-state operator authority", () => {
  it("binds the active commercial baseline to the current #730 review and merge-write contracts", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(CURRENT_730_EXACT);
    expect(baseline).not.toContain(STALE_730_EXACT);
    expect(baseline).toContain(REVIEW_STATE_OPERATOR_AUTHORITY);
    expect(baseline).toContain(REVIEW_STATE_MAPPING_TEST_AUTHORITY);
    expect(baseline).toContain(NOEMA_DECISION_AUTHORITY);
    expect(baseline).toContain(NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(baseline).toContain(NOEMA_MARKER_CARDINALITY_AUTHORITY);
    expect(baseline).toContain(NOEMA_REVIEW_DISMISSAL_AUTHORITY);
    expect(baseline).toContain(GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY);
    expect(baseline).toContain(NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY);
    expect(baseline).toContain(MERGE_BASE_SHA_AUTHORITY);
    expect(baseline).toContain(EQUAL_TIMESTAMP_RETRY_AUTHORITY);
    expect(hasExactReviewStateMappings(baseline)).toBe(true);
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
