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
    number: 26,
    state: "open",
    draft: false,
    baseRef: "main",
    headRepository: repository,
    headSha,
    mergeable: true,
    mergeableState: "clean",
    unresolvedThreadCount: 0,
    latestReviewStates: [{ reviewer: "human-reviewer", state: "APPROVED" }],
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

function reasonCodes(result: ReturnType<typeof evaluatePullRequest>) {
  return result.reasons.map((reason) => reason.code);
}

describe("commercial-readiness pull-request decision", () => {
  it("merges only a fully validated current-head snapshot", () => {
    expect(evaluatePullRequest(passingSnapshot())).toEqual({
      action: "merge",
      reasons: [],
    });
  });

  it("requests Noema review when every machine and human gate is ready", () => {
    const snapshot = passingSnapshot();
    snapshot.noemaReviewDecision = null;

    expect(evaluatePullRequest(snapshot)).toEqual({
      action: "request_review",
      reasons: [
        {
          code: "noema_current_head_approval_missing",
          detail: `No current-head Noema approval exists for ${headSha}.`,
        },
      ],
    });
  });

  it.each(REVIEW_DEPENDENT_CHECK_NAMES)(
    "requests Noema review while trusted review-dependent check %s is pending",
    (name) => {
      const snapshot = passingSnapshot();
      snapshot.noemaReviewDecision = null;
      snapshot.checkRuns.push({
        name,
        appSlug: githubActionsAppSlug,
        status: "queued",
        conclusion: null,
      });

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("request_review");
      expect(reasonCodes(result)).toEqual([
        "noema_current_head_approval_missing",
        "review_dependent_check_pending",
      ]);
    },
  );

  it.each(REVIEW_DEPENDENT_CHECK_NAMES)(
    "blocks merge while trusted review-dependent check %s is pending after approval",
    (name) => {
      const snapshot = passingSnapshot();
      snapshot.checkRuns.push({
        name,
        appSlug: githubActionsAppSlug,
        status: "in_progress",
        conclusion: null,
      });

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual({
        code: "review_dependent_check_pending",
        detail: `Review-dependent check ${name} is in_progress.`,
      });
    },
  );

  it("does not grant review-dependent treatment to a third-party check name collision", () => {
    const snapshot = passingSnapshot();
    snapshot.noemaReviewDecision = null;
    snapshot.checkRuns.push({
      name: "opencode-review",
      appSlug: "third-party-checks",
      status: "queued",
      conclusion: null,
    });

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "observed_check_pending",
      detail: "Observed check opencode-review is queued.",
    });
  });

  it.each([
    ["draft pull request", { draft: true }, "pr_is_draft"],
    ["closed pull request", { state: "closed" }, "pr_not_open"],
    ["non-main base", { baseRef: "release" }, "base_branch_not_main"],
    ["cross-repository head", { headRepository: "outside/fork" }, "head_repository_mismatch"],
    ["invalid head SHA", { headSha: "short" }, "invalid_head_sha"],
    ["unknown mergeability", { mergeable: null }, "mergeable_not_true"],
    ["behind merge state", { mergeableState: "behind" }, "merge_state_not_clean"],
  ])("blocks a %s", (_label, patch, expectedCode) => {
    const result = evaluatePullRequest({ ...passingSnapshot(), ...patch });

    expect(result.action).toBe("blocked");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it("blocks unresolved review threads", () => {
    const result = evaluatePullRequest({
      ...passingSnapshot(),
      unresolvedThreadCount: 2,
    });

    expect(result.action).toBe("blocked");
    expect(reasonCodes(result)).toContain("unresolved_review_threads");
  });

  it("blocks each reviewer's effective change request", () => {
    const result = evaluatePullRequest({
      ...passingSnapshot(),
      latestReviewStates: [
        { reviewer: "alice", state: "APPROVED" },
        { reviewer: "bob", state: "CHANGES_REQUESTED" },
      ],
    });

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "review_changes_requested",
      detail: "bob has an effective CHANGES_REQUESTED review.",
    });
  });

  it.each(["request_changes", "blocked"])(
    "blocks a current-head Noema %s decision",
    (decision) => {
      const result = evaluatePullRequest({
        ...passingSnapshot(),
        noemaReviewDecision: decision,
      });

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual({
        code: "noema_current_head_rejected",
        detail: `Noema current-head decision is ${decision}.`,
      });
    },
  );

  it.each(REQUIRED_CHECK_NAMES)("blocks a missing required %s check", (name) => {
    const snapshot = passingSnapshot();
    snapshot.checkRuns = snapshot.checkRuns.filter((check) => check.name !== name);

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "required_check_missing",
      detail: `Required check ${name} is missing from the current head.`,
    });
  });

  it("does not accept a third-party check that collides with a required name", () => {
    const snapshot = passingSnapshot();
    snapshot.checkRuns = snapshot.checkRuns.filter((check) => check.name !== "verify");
    snapshot.checkRuns.push({
      name: "verify",
      appSlug: "third-party-checks",
      status: "completed",
      conclusion: "success",
    });

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "required_check_missing",
      detail: "Required check verify is missing from the current head.",
    });
  });

  it("blocks when any trusted duplicate required check is pending", () => {
    const snapshot = passingSnapshot();
    snapshot.checkRuns.push({
      name: "verify",
      appSlug: githubActionsAppSlug,
      status: "in_progress",
      conclusion: null,
    });

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "required_check_pending",
      detail: "Required check verify is in_progress.",
    });
  });

  it("blocks a pending required check", () => {
    const snapshot = passingSnapshot();
    snapshot.checkRuns = snapshot.checkRuns.map((check) =>
      check.name === "verify"
        ? { ...check, status: "in_progress", conclusion: null }
        : check,
    );

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "required_check_pending",
      detail: "Required check verify is in_progress.",
    });
  });

  it.each(["failure", "cancelled", "timed_out", "action_required", "startup_failure"])(
    "blocks required check conclusion %s",
    (conclusion) => {
      const snapshot = passingSnapshot();
      snapshot.checkRuns = snapshot.checkRuns.map((check) =>
        check.name === "trivy-fs" ? { ...check, conclusion } : check,
      );

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual({
        code: "required_check_failed",
        detail: `Required check trivy-fs concluded ${conclusion}.`,
      });
    },
  );

  it("blocks a pending additional observed check", () => {
    const snapshot = passingSnapshot();
    snapshot.checkRuns.push({
      name: "buyer-contract-test",
      appSlug: "buyer-checks",
      status: "queued",
      conclusion: null,
    });

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "observed_check_pending",
      detail: "Observed check buyer-contract-test is queued.",
    });
  });

  it("blocks a failed additional observed check", () => {
    const snapshot = passingSnapshot();
    snapshot.checkRuns.push({
      name: "buyer-contract-test",
      appSlug: "buyer-checks",
      status: "completed",
      conclusion: "failure",
    });

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContainEqual({
      code: "observed_check_failed",
      detail: "Observed check buyer-contract-test concluded failure.",
    });
  });

  it.each(["neutral", "skipped"])(
    "blocks a completed observed check with %s conclusion",
    (conclusion) => {
      const snapshot = passingSnapshot();
      snapshot.checkRuns.push({
        name: "optional-advisory",
        appSlug: "advisory-checks",
        status: "completed",
        conclusion,
      });

      const result = evaluatePullRequest(snapshot);

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual({
        code: "observed_check_failed",
        detail: `Observed check optional-advisory concluded ${conclusion}.`,
      });
    },
  );

  it.each(["pending", "failure", "error"])(
    "blocks observed status context %s",
    (state) => {
      const result = evaluatePullRequest({
        ...passingSnapshot(),
        statuses: [{ context: "CodeRabbit", state }],
      });

      expect(result.action).toBe("blocked");
      expect(result.reasons).toContainEqual({
        code: "status_not_success",
        detail: `Status CodeRabbit is ${state}.`,
      });
    },
  );

  it("accumulates independent fail-closed reasons", () => {
    const snapshot = passingSnapshot();
    snapshot.draft = true;
    snapshot.unresolvedThreadCount = 1;
    snapshot.noemaReviewDecision = null;
    snapshot.checkRuns = [];

    const result = evaluatePullRequest(snapshot);

    expect(result.action).toBe("blocked");
    expect(reasonCodes(result)).toContain("pr_is_draft");
    expect(reasonCodes(result)).toContain("unresolved_review_threads");
    expect(reasonCodes(result)).toContain("required_check_missing");
    expect(reasonCodes(result)).toContain("noema_current_head_approval_missing");
  });
});
