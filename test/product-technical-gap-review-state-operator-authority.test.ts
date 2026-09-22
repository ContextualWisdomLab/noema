import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_730_EXACT = "#730 current exact `c8b776797f78f7440f6a96fb232efb9182d9a0a7`";
const STALE_730_EXACT = "#730 current exact `c23b3d186925e63a11f6777139995d37fce190ef`";
const REVIEW_STATE_OPERATOR_AUTHORITY =
  "active operator guide binds Noema marker decisions to exact GitHub review `state` authority";
const REVIEW_STATE_MAPPING_TEST_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const MERGE_BASE_SHA_AUTHORITY =
  "revalidates the freshly evaluated base SHA immediately before the normal merge write";
const EQUAL_TIMESTAMP_RETRY_AUTHORITY =
  "fails closed when distinct same-suite retries have identical observed chronology instead of ordering by opaque Check Run ids";
const APPROVAL_MAPPING = "`approve`→`APPROVED`";
const BLOCKING_MAPPING = "`request_changes`/`blocked`→`CHANGES_REQUESTED`";

function hasExactReviewStateMappings(baseline: string): boolean {
  return baseline.includes(APPROVAL_MAPPING) && baseline.includes(BLOCKING_MAPPING);
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
    expect(baseline).toContain(MERGE_BASE_SHA_AUTHORITY);
    expect(baseline).toContain(EQUAL_TIMESTAMP_RETRY_AUTHORITY);
    expect(hasExactReviewStateMappings(baseline)).toBe(true);
  });

  it("does not let swapped or missing marker-to-state authority satisfy the commercial index", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const swapped = baseline
      .replace(APPROVAL_MAPPING, "`approve`→`CHANGES_REQUESTED`")
      .replace(BLOCKING_MAPPING, "`request_changes`/`blocked`→`APPROVED`");
    const missingApprovalMapping = baseline.replace(APPROVAL_MAPPING, "");
    const missingBlockingMapping = baseline.replace(BLOCKING_MAPPING, "");

    expect(hasExactReviewStateMappings(swapped)).toBe(false);
    expect(hasExactReviewStateMappings(missingApprovalMapping)).toBe(false);
    expect(hasExactReviewStateMappings(missingBlockingMapping)).toBe(false);
  });
});
