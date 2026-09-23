import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";

function approvalReview(marker: string) {
  return {
    id: 101,
    submitted_at: "2026-09-23T00:00:00Z",
    commit_id: currentHead,
    state: "APPROVED",
    user: { login: trustedReviewerLogin, type: "Bot" },
    body: [
      "- Reviewer credential: `noema-github-app`",
      "",
      marker,
    ].join("\n"),
  };
}

describe("Noema review marker authority", () => {
  it("accepts only the exact canonical approval marker", () => {
    const canonical = `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`;
    const uppercaseDecision = `<!-- noema-review-gate head_sha=${currentHead} decision=APPROVE -->`;
    const mixedCaseDecision = `<!-- noema-review-gate head_sha=${currentHead} decision=Approve -->`;
    const uppercaseHead = `<!-- noema-review-gate head_sha=${currentHead.toUpperCase()} decision=approve -->`;

    expect(parseNoemaReviewDecision(
      [approvalReview(canonical)],
      currentHead,
      trustedReviewerLogin,
    )).toBe("approve");

    for (const marker of [uppercaseDecision, mixedCaseDecision, uppercaseHead]) {
      expect(parseNoemaReviewDecision(
        [approvalReview(marker)],
        currentHead,
        trustedReviewerLogin,
      )).toBeNull();
    }
  });
});
