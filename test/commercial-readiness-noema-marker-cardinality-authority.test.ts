import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";

function reviewWithBody(body: string) {
  return {
    id: 201,
    submitted_at: "2026-09-23T00:00:00Z",
    commit_id: currentHead,
    state: "APPROVED",
    user: { login: trustedReviewerLogin, type: "Bot" },
    body,
  };
}

describe("Noema review marker cardinality authority", () => {
  it("fails closed when one trusted review body contains multiple canonical Noema markers", () => {
    const blocked = `<!-- noema-review-gate head_sha=${currentHead} decision=blocked -->`;
    const approve = `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`;
    const body = [
      "Reviewer credential: `noema-github-app`",
      blocked,
      approve,
    ].join("\n");

    expect(parseNoemaReviewDecision(
      [reviewWithBody(body)],
      currentHead,
      trustedReviewerLogin,
    )).toBeNull();
  });

  it("fails closed when a trusted review body repeats the same canonical marker", () => {
    const approve = `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`;
    const body = [
      "Reviewer credential: `noema-github-app`",
      approve,
      approve,
    ].join("\n");

    expect(parseNoemaReviewDecision(
      [reviewWithBody(body)],
      currentHead,
      trustedReviewerLogin,
    )).toBeNull();
  });
});
