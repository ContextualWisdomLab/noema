import { describe, expect, it } from "vitest";

import { latestReviewStates } from "../scripts/hourly-commercial-readiness.mjs";

function review(login: string, state: string) {
  return { user: { login }, state };
}

describe("commercial readiness generic review-state projection", () => {
  it("keeps generic reviewer state projection available after Noema gate revocation hardening", () => {
    expect(latestReviewStates([
      review("alice", "APPROVED"),
      review("bob", "CHANGES_REQUESTED"),
    ])).toEqual([
      { reviewer: "alice", state: "APPROVED" },
      { reviewer: "bob", state: "CHANGES_REQUESTED" },
    ]);
  });

  it("uses GitHub review-list order and lets DISMISSED revoke the prior reviewer state", () => {
    expect(latestReviewStates([
      review("alice", "APPROVED"),
      review("alice", "DISMISSED"),
      review("bob", "APPROVED"),
    ])).toEqual([{ reviewer: "bob", state: "APPROVED" }]);
  });
});
