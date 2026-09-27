import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const currentBase = "b".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";
const baseLine = `- Base SHA: \`${currentBase}\``;
const canonicalMarker = `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`;

function reviewWithBody(body: string) {
  return {
    id: 301,
    submitted_at: "2026-09-23T07:00:00Z",
    commit_id: currentHead,
    state: "APPROVED",
    user: { login: trustedReviewerLogin, type: "Bot" },
    body,
  };
}

describe("Noema review credential position authority", () => {
  it("accepts the publisher-owned base and credential lines immediately before the canonical marker", () => {
    const body = [
      "## Noema PydanticAI review",
      "",
      baseLine,
      "- Reviewer credential: `noema-github-app`",
      "",
      canonicalMarker,
    ].join("\n");

    expect(parseNoemaReviewDecision(
      [reviewWithBody(body)],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBe("approve");
  });

  it.each([
    [
      "credential echoed only in model-controlled prose",
      [
        "Summary mentions Reviewer credential: `noema-github-app` as untrusted prose.",
        "",
        baseLine,
        canonicalMarker,
      ].join("\n"),
    ],
    [
      "earlier exact credential masking a wrong publisher credential",
      [
        "Reviewer credential: `noema-github-app`",
        "",
        baseLine,
        "- Reviewer credential: `NOEMA_REVIEW_TOKEN`",
        "",
        canonicalMarker,
      ].join("\n"),
    ],
    [
      "bare exact credential line immediately before the marker",
      [
        baseLine,
        "Reviewer credential: `noema-github-app`",
        canonicalMarker,
      ].join("\n"),
    ],
  ])("fails closed when %s", (_label, body) => {
    expect(parseNoemaReviewDecision(
      [reviewWithBody(body)],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBeNull();
  });
});
