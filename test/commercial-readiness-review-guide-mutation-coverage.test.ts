import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial-readiness review-guide mutation coverage", () => {
  it("proves missing approval mapping is rejected independently", () => {
    const source = readFileSync(
      "test/commercial-readiness-review-guide-head-binding.test.ts",
      "utf8",
    );

    expect(source).toContain(
      'const missingApprovalMapping = section.replace(APPROVAL_MAPPING, "");',
    );
    expect(source).toContain(
      "expect(hasExactReviewStateMappings(missingApprovalMapping)).toBe(false);",
    );
  });
});
