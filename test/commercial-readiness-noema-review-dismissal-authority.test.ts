import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const currentBase = "b".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";
const baseLine = `- Base SHA: \`${currentBase}\``;
const credential = "- Reviewer credential: `noema-github-app`";
const approvalMarker = `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`;

function gateBody(marker = approvalMarker) {
  return [baseLine, credential, "", marker].join("\n");
}

function review(id: number, state: string, body: string) {
  return {
    id,
    submitted_at: `2026-09-23T00:0${id}:00Z`,
    commit_id: currentHead,
    state,
    user: { login: trustedReviewerLogin, type: "Bot" },
    body,
  };
}

describe("Noema dismissed-review authority", () => {
  it("does not fall back to an older exact-head approval after a later trusted review is dismissed", () => {
    const olderApproval = review(1, "APPROVED", gateBody());
    const laterDismissed = review(2, "DISMISSED", gateBody());

    expect(parseNoemaReviewDecision(
      [olderApproval, laterDismissed],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBeNull();
  });

  it("allows a newer exact-head approval to supersede an earlier dismissed review", () => {
    const earlierDismissed = review(1, "DISMISSED", gateBody());
    const newerApproval = review(2, "APPROVED", gateBody());

    expect(parseNoemaReviewDecision(
      [earlierDismissed, newerApproval],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBe("approve");
  });

  it("treats a trusted exact-head DISMISSED state as revocation even when its body marker is absent", () => {
    const olderApproval = review(1, "APPROVED", gateBody());
    const laterDismissed = review(2, "DISMISSED", "Review dismissed by an authorized maintainer.");

    expect(parseNoemaReviewDecision(
      [olderApproval, laterDismissed],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBeNull();
  });
});
