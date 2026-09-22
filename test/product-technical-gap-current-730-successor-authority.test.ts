import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_730_EXACT = "35bbcb95c9e42d07c602ea100da7605f7c0f240d";
const CURRENT_MARKER = `#730 current exact \`${CURRENT_730_EXACT}\``;
const CURRENT_CANDIDATE = `candidate #730 exact \`${CURRENT_730_EXACT}\``;
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";
const NOEMA_DECISION_AUTHORITY =
  "requires exact canonical Noema decision token without whitespace or case normalization";
const NOEMA_MARKER_SERIALIZATION_AUTHORITY =
  "requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization";
const PRODUCTION_DOCSTRING_AUTHORITY =
  "100% 37-function authority-bearing production docstring scope contract";

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
    expect(baseline).toContain(PRODUCTION_DOCSTRING_AUTHORITY);
  });

  it("moves every changed authority fixture to the same current #730 exact", () => {
    for (const path of authoritySources) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain(CURRENT_730_EXACT);
    }
  });
});
