import { describe, expect, it } from "vitest";
import {
  REQUIRED_CHECK_NAMES,
  evaluatePullRequest,
} from "../scripts/lib/commercial-readiness-loop.mjs";

const repository = "ContextualWisdomLab/noema";
const headSha = "d".repeat(40);

describe("commercial-readiness check producer identity", () => {
  it("blocks a third-party required-check name collision even when the trusted gate passes", () => {
    const snapshot = {
      repository,
      number: 28,
      state: "open",
      draft: false,
      baseRef: "main",
      headRepository: repository,
      headSha,
      mergeable: true,
      mergeableState: "clean",
      unresolvedThreadCount: 0,
      latestReviewStates: [],
      noemaReviewDecision: "approve",
      checkRuns: [
        ...REQUIRED_CHECK_NAMES.map((name) => ({
          name,
          appSlug: "github-actions",
          status: "completed",
          conclusion: "success",
        })),
        {
          name: "verify",
          appSlug: "third-party-checks",
          status: "completed",
          conclusion: "success",
        },
      ],
      statuses: [{ context: "CodeRabbit", state: "success" }],
    };

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "required_check_producer_collision",
      detail: "Required check name verify was also produced by third-party-checks.",
    });
  });
});
