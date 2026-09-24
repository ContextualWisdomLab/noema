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

describe("commercial readiness pull-request identity authority", () => {
  it.each([
    ["state", " open ", "pr_not_open"],
    ["baseRef", " main ", "base_branch_not_main"],
    ["repository", ` ${repository} `, "head_repository_mismatch"],
    ["headRepository", ` ${repository} `, "head_repository_mismatch"],
    ["headSha", ` ${headSha} `, "invalid_head_sha"],
    ["mergeableState", " clean ", "merge_state_not_clean"],
  ] as const)(
    "does not normalize %s into canonical merge authority",
    (field, value, expectedReasonCode) => {
      const snapshot = passingSnapshot();
      snapshot[field] = value;

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons.some((reason) => reason.code === expectedReasonCode)).toBe(true);
    },
  );
});
