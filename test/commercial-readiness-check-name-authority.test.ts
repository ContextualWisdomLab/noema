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

describe("commercial readiness check-name authority", () => {
  it("does not normalize a whitespace-altered required check into merge authority", () => {
    const snapshot = passingSnapshot();
    snapshot.checkRuns = snapshot.checkRuns.map((check) =>
      check.name === "verify" ? { ...check, name: " verify " } : check,
    );

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "required_check_missing",
      detail: "Required check verify is missing from the current head.",
    });
  });

  it.each([" github-actions ", "GitHub-Actions"])(
    "does not normalize producer identity %j into trusted GitHub Actions authority",
    (appSlug) => {
      const snapshot = passingSnapshot();
      snapshot.checkRuns = snapshot.checkRuns.map((check) =>
        check.name === "verify" ? { ...check, appSlug } : check,
      );

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual({
        code: "required_check_producer_collision",
        detail: `Required check name verify was also produced by ${appSlug.trim()}.`,
      });
      expect(result.reasons).toContainEqual({
        code: "required_check_missing",
        detail: "Required check verify is missing from the current head.",
      });
    },
  );
});
