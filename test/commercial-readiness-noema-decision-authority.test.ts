import { describe, expect, it } from "vitest";

import {
  REQUIRED_CHECK_NAMES,
  evaluatePullRequest,
} from "../scripts/lib/commercial-readiness-loop.mjs";

const repository = "ContextualWisdomLab/noema";
const headSha = "a".repeat(40);

function passingSnapshot() {
  return {
    repository,
    number: 730,
    state: "open",
    draft: false,
    baseRef: "main",
    headRepository: repository,
    headSha,
    mergeable: true,
    mergeableState: "clean",
    unresolvedThreadCount: 0,
    latestReviewStates: [{ reviewer: "independent-reviewer", state: "APPROVED" }],
    noemaReviewDecision: "approve",
    checkRuns: REQUIRED_CHECK_NAMES.map((name) => ({
      name,
      appSlug: "github-actions",
      status: "completed",
      conclusion: "success",
    })),
    statuses: [],
  };
}

describe("commercial readiness Noema decision authority", () => {
  it("accepts only the canonical exact approve decision", () => {
    expect(evaluatePullRequest(passingSnapshot())).toEqual({ action: "merge", reasons: [] });
  });

  it.each(["APPROVE", "Approve"])(
    "rejects non-canonical Noema decision %j as an explicit current-head decision",
    (decision) => {
      const snapshot = passingSnapshot();
      snapshot.noemaReviewDecision = decision;

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual(expect.objectContaining({
        code: "noema_current_head_rejected",
      }));
    },
  );

  it("does not normalize whitespace-padded approval into merge authority", () => {
    const snapshot = passingSnapshot();
    snapshot.noemaReviewDecision = " approve ";

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("request_review");
    expect(result.reasons).toContainEqual(expect.objectContaining({
      code: "noema_current_head_approval_missing",
    }));
  });
});
