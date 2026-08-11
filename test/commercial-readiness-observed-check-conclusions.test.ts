import { describe, expect, it } from "vitest";
import {
  REQUIRED_CHECK_NAMES,
  REVIEW_DEPENDENT_CHECK_NAMES,
  evaluatePullRequest,
} from "../scripts/lib/commercial-readiness-loop.mjs";

const repository = "ContextualWisdomLab/noema";
const headSha = "a".repeat(40);
const githubActionsAppSlug = "github-actions";

function passingSnapshot() {
  return {
    repository,
    number: 156,
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
      appSlug: githubActionsAppSlug,
      status: "completed",
      conclusion: "success",
    })),
    statuses: [{ context: "CodeRabbit", state: "success" }],
  };
}

describe("commercial-readiness observed check conclusions", () => {
  it.each(["neutral", "skipped"])(
    "blocks an ordinary observed check that concluded %s",
    (conclusion) => {
      const snapshot = passingSnapshot();
      snapshot.checkRuns.push({
        name: "buyer-contract-test",
        appSlug: "buyer-checks",
        status: "completed",
        conclusion,
      });

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual({
        code: "observed_check_failed",
        detail: `Observed check buyer-contract-test concluded ${conclusion}.`,
      });
    },
  );

  it.each(REVIEW_DEPENDENT_CHECK_NAMES)(
    "blocks trusted review-dependent check %s when its completed result is neutral or skipped",
    (name) => {
      for (const conclusion of ["neutral", "skipped"]) {
        const snapshot = passingSnapshot();
        snapshot.checkRuns.push({
          name,
          appSlug: githubActionsAppSlug,
          status: "completed",
          conclusion,
        });

        const result = evaluatePullRequest(snapshot);

        expect(result.action).toBe("blocked");
        expect(result.reasons).toContainEqual({
          code: "review_dependent_check_failed",
          detail: `Review-dependent check ${name} concluded ${conclusion}.`,
        });
      }
    },
  );

  it.each(["neutral", "skipped"])(
    "does not request review when a trusted review-dependent check already concluded %s",
    (conclusion) => {
      const snapshot = passingSnapshot();
      snapshot.noemaReviewDecision = null;
      snapshot.checkRuns.push({
        name: REVIEW_DEPENDENT_CHECK_NAMES[0],
        appSlug: githubActionsAppSlug,
        status: "completed",
        conclusion,
      });

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons.map((reason) => reason.code)).toEqual([
        "noema_current_head_approval_missing",
        "review_dependent_check_failed",
      ]);
    },
  );
});
