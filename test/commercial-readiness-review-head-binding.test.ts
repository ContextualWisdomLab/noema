import { describe, expect, it } from "vitest";

import {
  latestReviewStates,
  parseNoemaReviewDecision,
} from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const currentBase = "b".repeat(40);
const trustedReviewer = "noema-reviewer[bot]";
const baseLine = `- Base SHA: \`${currentBase}\``;
const credentialLine = "- Reviewer credential: `noema-github-app`";

function currentHeadApproval(overrides = {}) {
  return {
    id: 101,
    submitted_at: "2026-09-22T08:30:00Z",
    commit_id: currentHead,
    state: "APPROVED",
    user: { login: trustedReviewer, type: "Bot" },
    body: [
      baseLine,
      credentialLine,
      "",
      `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`,
    ].join("\n"),
    ...overrides,
  };
}

describe("commercial-readiness review head binding", () => {
  it("fails closed when a trusted approval omits GitHub review commit identity", () => {
    const review = currentHeadApproval();
    delete review.commit_id;

    expect(parseNoemaReviewDecision(
      [review],
      currentHead,
      currentBase,
      trustedReviewer,
    )).toBeNull();
  });

  it("does not normalize a non-canonical GitHub review state into approval authority", () => {
    expect(parseNoemaReviewDecision(
      [currentHeadApproval({ state: "approved" })],
      currentHead,
      currentBase,
      trustedReviewer,
    )).toBeNull();
  });

  it("does not let normalized reviewer identity/state dismiss a canonical change request", () => {
    expect(latestReviewStates([
      {
        id: 201,
        submitted_at: "2026-09-22T08:00:00Z",
        state: "CHANGES_REQUESTED",
        user: { login: "human-reviewer" },
      },
      {
        id: 202,
        submitted_at: "2026-09-22T08:10:00Z",
        state: "dismissed",
        user: { login: " human-reviewer " },
      },
    ])).toEqual([
      { reviewer: "human-reviewer", state: "CHANGES_REQUESTED" },
    ]);
  });

  it("preserves GitHub REST review-list chronology when a later blocker omits submitted_at", () => {
    expect(latestReviewStates([
      {
        id: 301,
        submitted_at: "2026-09-22T08:00:00Z",
        state: "APPROVED",
        user: { login: "human-reviewer" },
      },
      {
        id: 302,
        submitted_at: null,
        state: "CHANGES_REQUESTED",
        user: { login: "human-reviewer" },
      },
    ])).toEqual([
      { reviewer: "human-reviewer", state: "CHANGES_REQUESTED" },
    ]);
  });

  it("preserves GitHub REST review-list chronology for exact-head Noema decisions", () => {
    const laterBlocker = currentHeadApproval({
      id: 402,
      submitted_at: null,
      state: "CHANGES_REQUESTED",
      body: [
        baseLine,
        credentialLine,
        "",
        `<!-- noema-review-gate head_sha=${currentHead} decision=request_changes -->`,
      ].join("\n"),
    });

    expect(parseNoemaReviewDecision(
      [
        currentHeadApproval({
          id: 401,
          submitted_at: "2026-09-22T08:00:00Z",
        }),
        laterBlocker,
      ],
      currentHead,
      currentBase,
      trustedReviewer,
    )).toBe("request_changes");
  });
});
