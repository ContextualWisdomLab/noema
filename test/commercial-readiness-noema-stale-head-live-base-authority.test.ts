import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const staleHead = "c".repeat(40);
const currentBase = "b".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";

function approvalFor(headSha: string) {
  return {
    id: 901,
    submitted_at: "2026-09-23T13:20:00Z",
    commit_id: headSha,
    state: "APPROVED",
    user: { login: trustedReviewerLogin, type: "Bot" },
    body: [
      `- Base SHA: \`${currentBase}\``,
      "- Reviewer credential: `noema-github-app`",
      "",
      `<!-- noema-review-gate head_sha=${headSha} decision=approve -->`,
    ].join("\n"),
  };
}

describe("Noema stale-head authority with a live base binding", () => {
  it("rejects an otherwise canonical current-base approval whose review commit and marker bind a stale head", () => {
    expect(parseNoemaReviewDecision(
      [approvalFor(staleHead)],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBeNull();
  });
});
