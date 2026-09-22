import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_730_EXACT = "c8b776797f78f7440f6a96fb232efb9182d9a0a7";
const CURRENT_MARKER = `#730 current exact \`${CURRENT_730_EXACT}\``;
const CURRENT_CANDIDATE = `candidate #730 exact \`${CURRENT_730_EXACT}\``;
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const MERGE_BASE_SHA_AUTHORITY =
  "revalidates the freshly evaluated base SHA immediately before the normal merge write";
const PRODUCTION_DOCSTRING_AUTHORITY =
  "100% 38-function authority-bearing production docstring scope contract";
const HOSTED_RED_TEST_CONTRACT_AUTHORITY =
  "hosted RED test-contract RCA preserves missing-approval versus explicit-rejection semantics, fail-closed missing retry chronology, and the 38-function direct-JSDoc gate without changing production merge authority";
const EQUAL_TIMESTAMP_RETRY_AUTHORITY =
  "fails closed when distinct same-suite retries have identical observed chronology instead of ordering by opaque Check Run ids";

const authoritySources = [
  "test/product-technical-gap-current-authority.test.ts",
  "test/product-technical-gap-post-726-merge-authority.test.ts",
  "test/product-technical-gap-review-head-authority.test.ts",
  "test/product-technical-gap-review-state-operator-authority.test.ts",
  "test/product-technical-gap-commit-status-projection-authority.test.ts",
];

describe("commercial baseline follows the current #730 successor", () => {
  it("binds the active baseline and governance row to the exact current #730 head", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(CURRENT_MARKER);
    expect(baseline).toContain(CURRENT_CANDIDATE);
    expect(baseline).toContain(REVIEW_GUIDE_MUTATION_AUTHORITY);
    expect(baseline).toContain(NOEMA_DECISION_AUTHORITY);
    expect(baseline).toContain(NOEMA_MARKER_SERIALIZATION_AUTHORITY);
    expect(baseline).toContain(MERGE_BASE_SHA_AUTHORITY);
    expect(baseline).toContain(PRODUCTION_DOCSTRING_AUTHORITY);
    expect(baseline).toContain(HOSTED_RED_TEST_CONTRACT_AUTHORITY);
    expect(baseline).toContain(EQUAL_TIMESTAMP_RETRY_AUTHORITY);
  });

  it("moves every changed authority fixture to the same current #730 exact", () => {
    for (const path of authoritySources) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain(CURRENT_730_EXACT);
    }
  });
});
