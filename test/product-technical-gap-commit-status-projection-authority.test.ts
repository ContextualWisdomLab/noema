import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_OPEN_LANE_HEADING = "## Current open-lane authority — 2026-09-22 KST";
const CURRENT_730_EXACT = "#730 current exact `6bc9f0462748cceda34c5d258f11cb40efb6401d`";
const STALE_730_EXACT = "#730 current exact `3c315332ba40230495bf4a57c3b6dee96b394992`";
const STATUS_PROJECTION_AUTHORITY =
  "preserves exact Commit Status context/state identity before terminal merge-authority evaluation";
const RETRY_CHRONOLOGY_AUTHORITY =
  "fails closed when same-suite retry chronology lacks parseable `started_at`/`completed_at` evidence";
const EQUAL_TIMESTAMP_RETRY_AUTHORITY =
  "fails closed when distinct same-suite retries have identical observed chronology instead of ordering by opaque Check Run ids";
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const NOEMA_MARKER_CARDINALITY_AUTHORITY =
  "requires exactly one canonical Noema review marker per trusted review body and rejects duplicate or conflicting markers";
const NOEMA_REVIEW_DISMISSAL_AUTHORITY =
  "treats trusted exact-head `DISMISSED` review state as revocation and never falls back to an older Noema approval";
const GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY =
  "preserves generic reviewer-state projection while malformed credentialed exact-head Noema gate successors revoke prior approval";
const NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY =
  "revokes prior Noema approval when a later trusted exact-head canonical gate marker loses its reviewer credential while preserving ordinary review comments";
const MERGE_BASE_SHA_AUTHORITY =
  "revalidates the freshly evaluated base SHA immediately before the normal merge write";
const GOVERNANCE_ROW_PREFIX = "| P0 | Protected-main governance closure |";
const GOVERNANCE_CANDIDATE =
  "issue #27; candidate #730 exact `6bc9f0462748cceda34c5d258f11cb40efb6401d`";
const GOVERNANCE_STATUS_PROJECTION_AUTHORITY = "exact Commit Status collection projection identity";
const GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY = "fail-closed unknown retry chronology";
const GOVERNANCE_EQUAL_TIMESTAMP_RETRY_AUTHORITY = "fail-closed equal-timestamp retry ambiguity";
const GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY =
  "independently rejects missing approval and missing blocking marker-to-state mappings";
const GOVERNANCE_NOEMA_DECISION_AUTHORITY = "exact canonical Noema decision token authority";
const GOVERNANCE_NOEMA_MARKER_SERIALIZATION_AUTHORITY = "exact Noema review marker serialization authority";
const GOVERNANCE_NOEMA_MARKER_CARDINALITY_AUTHORITY = "exact-one Noema review marker cardinality authority";
const GOVERNANCE_NOEMA_REVIEW_DISMISSAL_AUTHORITY = "trusted exact-head DISMISSED review revocation authority";
const GOVERNANCE_GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY = "generic reviewer-state projection preservation authority";
const GOVERNANCE_NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY =
  "uncredentialed canonical Noema gate successor revocation authority";
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
    expect(section).toContain(EQUAL_TIMESTAMP_RETRY_AUTHORITY);
    expect(section).toContain(REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(section).toContain(NOEMA_DECISION_AUTHORITY);
    expect(section).toContain(NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(section).toContain(NOEMA_MARKER_CARDINALITY_AUTHORITY);
    expect(section).toContain(NOEMA_REVIEW_DISMISSAL_AUTHORITY);
    expect(section).toContain(GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY);
    expect(section).toContain(NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY);
    expect(section).toContain(MERGE_BASE_SHA_AUTHORITY);
    expect(row).toContain(GOVERNANCE_CANDIDATE);
    expect(row).toContain(GOVERNANCE_STATUS_PROJECTION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_RETRY_CHRONOLOGY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_EQUAL_TIMESTAMP_RETRY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_DECISION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_MARKER_CARDINALITY_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_REVIEW_DISMISSAL_AUTHORITY);
    expect(row).toContain(GOVERNANCE_GENERIC_REVIEW_STATE_PROJECTION_AUTHORITY);
    expect(row).toContain(GOVERNANCE_NOEMA_CREDENTIAL_SUCCESSOR_AUTHORITY);
    expect(row).toContain(GOVERNANCE_MERGE_BASE_SHA_AUTHORITY);
  });
});
