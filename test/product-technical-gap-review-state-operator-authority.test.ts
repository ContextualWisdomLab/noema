import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_730_EXACT = "#730 current exact `8146360fc10ce23da50344d605138a4d783d77e5`";
const REVIEW_STATE_OPERATOR_AUTHORITY =
  "active operator guide binds Noema marker decisions to exact GitHub review `state` authority";
const REVIEW_STATE_MAPPING_TEST_AUTHORITY =
  "executable guide contract rejects swapped or missing marker-to-state mappings";

describe("product-technical gap review-state operator authority", () => {
  it("binds the active commercial baseline to the current #730 review-state operator contract", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(CURRENT_730_EXACT);
    expect(baseline).toContain(REVIEW_STATE_OPERATOR_AUTHORITY);
    expect(baseline).toContain(REVIEW_STATE_MAPPING_TEST_AUTHORITY);
    expect(baseline).not.toContain("#730 current exact `e4ccde409f1792df9842548cca0dd3f9e7e70530`");
  });
});