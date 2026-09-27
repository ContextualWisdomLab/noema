import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const currentBase = "b".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";
const credential = "- Reviewer credential: `noema-github-app`";
const approvalMarker = `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`;

function approvalReview(login: string) {
  return {
    id: 101,
    submitted_at: "2026-09-23T05:20:00Z",
    commit_id: currentHead,
    state: "APPROVED",
    user: { login, type: "Bot" },
    body: [
      `- Base SHA: \`${currentBase}\``,
      credential,
      "",
      approvalMarker,
    ].join("\n"),
  };
}

describe("Noema reviewer login authority", () => {
  it("admits only the exact configured reviewer login without case folding", () => {
    expect(parseNoemaReviewDecision(
      [approvalReview(trustedReviewerLogin)],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBe("approve");

    for (const login of ["Noema-reviewer[bot]", "NOEMA-REVIEWER[BOT]"]) {
      expect(parseNoemaReviewDecision(
        [approvalReview(login)],
        currentHead,
        currentBase,
        trustedReviewerLogin,
      )).toBeNull();
    }
  });
});
