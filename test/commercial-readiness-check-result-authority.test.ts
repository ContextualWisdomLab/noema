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

describe("commercial readiness check-result authority", () => {
  it.each([
    { field: "status", value: " completed ", code: "required_check_pending" },
    { field: "status", value: "COMPLETED", code: "required_check_pending" },
    { field: "conclusion", value: " success ", code: "required_check_failed" },
    { field: "conclusion", value: "SUCCESS", code: "required_check_failed" },
  ])(
    "does not normalize $field=$value into terminal required-check authority",
    ({ field, value, code }) => {
      const snapshot = passingSnapshot();
      snapshot.checkRuns = snapshot.checkRuns.map((check) =>
        check.name === "verify" ? { ...check, [field]: value } : check,
      );

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons.some((reason) => reason.code === code)).toBe(true);
    },
  );

  it.each([
    { field: "status", value: " completed ", code: "observed_check_pending" },
    { field: "conclusion", value: " success ", code: "observed_check_failed" },
  ])(
    "does not normalize $field=$value into optional-check authority",
    ({ field, value, code }) => {
      const snapshot = passingSnapshot();
      snapshot.checkRuns.push({
        name: "additional-safety-check",
        appSlug: "github-actions",
        status: "completed",
        conclusion: "success",
        [field]: value,
      });

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons.some((reason) => reason.code === code)).toBe(true);
    },
  );
});
