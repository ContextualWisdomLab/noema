import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_730_EXACT = "c9ed50e380d4498a4386a1b28c440aa4414991e6";
const CURRENT_MARKER = `#730 current exact \`${CURRENT_730_EXACT}\``;
const CURRENT_CANDIDATE = `candidate #730 exact \`${CURRENT_730_EXACT}\``;
const REVIEW_GUIDE_MUTATION_AUTHORITY =
  "executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings";

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
  });

  it("moves every changed authority fixture to the same current #730 exact", () => {
    for (const path of authoritySources) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain(CURRENT_730_EXACT);
    }
  });
});
