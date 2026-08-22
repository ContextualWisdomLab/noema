import { describe, expect, it } from "vitest";
import {
  REQUIRED_CHECK_NAMES,
  evaluatePullRequest,
} from "../scripts/lib/commercial-readiness-loop.mjs";

const repository = "ContextualWisdomLab/noema";

function otherwisePassingSnapshot(headSha: string) {
  return {
    repository,
    number: 461,
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
    statuses: [{ context: "CodeRabbit", state: "success" }],
  };
}

describe("commercial-readiness exact head identity", () => {
  it.each([
    "A".repeat(40),
    `${"a".repeat(39)}A`,
  ])("rejects a non-canonical uppercase head SHA %s", (headSha) => {
    const result = evaluatePullRequest(otherwisePassingSnapshot(headSha));

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "invalid_head_sha",
      detail: "Pull request head SHA must be the canonical lowercase 40-character hexadecimal identity.",
    });
  });
});
