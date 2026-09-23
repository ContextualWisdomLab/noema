import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";
const credential = "Reviewer credential: `noema-github-app`";
const approvalMarker = `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`;

function review(id: number, state: string, body: string) {
  return {
    id,
    submitted_at: `2026-09-23T01:0${id}:00Z`,
    commit_id: currentHead,
    state,
    user: { login: trustedReviewerLogin, type: "Bot" },
    body,
  };
}

describe("Noema malformed-successor review authority", () => {
  it("does not let a passing malformed-successor test hide a non-authoritative predecessor fixture", () => {
    const olderApproval = review(1, "APPROVED", [credential, approvalMarker].join("\n"));

    expect(parseNoemaReviewDecision(
      [olderApproval],
      currentHead,
      trustedReviewerLogin,
    )).toBe("approve");
  });

  it("does not fall back to an older approval when a later trusted gate review has ambiguous marker cardinality", () => {
    const olderApproval = review(1, "APPROVED", [credential, approvalMarker].join("\n"));
    const laterMalformedApproval = review(
      2,
      "APPROVED",
      [credential, approvalMarker, approvalMarker].join("\n"),
    );

    expect(parseNoemaReviewDecision(
      [olderApproval, laterMalformedApproval],
      currentHead,
      trustedReviewerLogin,
    )).toBeNull();
  });

  it("does not fall back to an older approval when a later trusted gate review loses its credential marker", () => {
    const olderApproval = review(1, "APPROVED", [credential, approvalMarker].join("\n"));
    const laterUncredentialedApproval = review(2, "APPROVED", approvalMarker);

    expect(parseNoemaReviewDecision(
      [olderApproval, laterUncredentialedApproval],
      currentHead,
      trustedReviewerLogin,
    )).toBeNull();
  });
});
