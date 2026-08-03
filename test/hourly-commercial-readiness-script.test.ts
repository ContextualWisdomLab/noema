import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  flattenArrayPages,
  hasActiveNoemaReviewRun,
  latestReviewStates,
  parseNoemaReviewDecision,
} from "../scripts/hourly-commercial-readiness.mjs";

const repository = "ContextualWisdomLab/noema";
const headSha = "b".repeat(40);

function review({
  login = "noema-reviewer[bot]",
  type = "Bot",
  state = "APPROVED",
  body = `- Reviewer credential: \`noema-github-app\`\n<!-- noema-review-gate head_sha=${headSha} decision=approve -->`,
  submittedAt = "2026-08-03T00:00:00Z",
  id = 1,
} = {}) {
  return {
    id,
    state,
    body,
    submitted_at: submittedAt,
    user: { login, type },
  };
}

describe("hourly commercial-readiness GitHub adapter", () => {
  it("flattens every array page returned by gh --paginate --slurp", () => {
    expect(flattenArrayPages([[{ id: 1 }], [{ id: 2 }], []])).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("requires a current-head marker and App credential from a Noema bot", () => {
    expect(parseNoemaReviewDecision([review()], headSha)).toBe("approve");
    expect(
      parseNoemaReviewDecision([review({ login: "human", type: "User" })], headSha),
    ).toBeNull();
    expect(
      parseNoemaReviewDecision([review({ login: "other-app[bot]" })], headSha),
    ).toBeNull();
    expect(
      parseNoemaReviewDecision([
        review({
          body: `<!-- noema-review-gate head_sha=${headSha} decision=approve -->`,
        }),
      ], headSha),
    ).toBeNull();
    expect(
      parseNoemaReviewDecision([
        review({
          body: `- Reviewer credential: \`noema-github-app\`\n<!-- noema-review-gate head_sha=${"c".repeat(40)} decision=approve -->`,
        }),
      ], headSha),
    ).toBeNull();
  });

  it("uses the newest authenticated Noema decision for the current head", () => {
    const reviews = [
      review({ submittedAt: "2026-08-03T00:00:00Z", id: 10 }),
      review({
        state: "CHANGES_REQUESTED",
        body: `- Reviewer credential: \`noema-github-app\`\n<!-- noema-review-gate head_sha=${headSha} decision=request_changes -->`,
        submittedAt: "2026-08-03T00:05:00Z",
        id: 11,
      }),
    ];

    expect(parseNoemaReviewDecision(reviews, headSha)).toBe("request_changes");
  });

  it("reduces review submissions to the latest effective decision per reviewer", () => {
    expect(
      latestReviewStates([
        review({ login: "alice", type: "User", state: "CHANGES_REQUESTED", id: 1 }),
        review({
          login: "alice",
          type: "User",
          state: "APPROVED",
          submittedAt: "2026-08-03T00:10:00Z",
          id: 2,
        }),
        review({ login: "bob", type: "User", state: "COMMENTED", id: 3 }),
      ]),
    ).toEqual([{ reviewer: "alice", state: "APPROVED" }]);
  });

  it("retains untrusted Noema-like bot change requests as effective reviews", () => {
    expect(
      latestReviewStates([
        review({
          login: "noema-spoof[bot]",
          type: "Bot",
          state: "CHANGES_REQUESTED",
          body: "untrusted review without a Noema credential marker",
        }),
      ]),
    ).toEqual([{ reviewer: "noema-spoof[bot]", state: "CHANGES_REQUESTED" }]);
  });

  it("recognizes only an active exact-target central review run", () => {
    const title = `Noema central review ${repository}#28@${headSha}`;
    expect(
      hasActiveNoemaReviewRun([
        { event: "repository_dispatch", status: "queued", display_title: title },
      ], repository, 28, headSha),
    ).toBe(true);
    expect(
      hasActiveNoemaReviewRun([
        { event: "repository_dispatch", status: "completed", display_title: title },
      ], repository, 28, headSha),
    ).toBe(false);
    expect(
      hasActiveNoemaReviewRun([
        {
          event: "repository_dispatch",
          status: "in_progress",
          display_title: `Noema central review ${repository}#28@${"c".repeat(40)}`,
        },
      ], repository, 28, headSha),
    ).toBe(false);
  });

  it("uses shell-free complete pagination and exact-head write contracts", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    expect(script).toContain('spawnSync("gh"');
    expect(script).toContain("shell: false");
    expect(script).toContain('"--paginate", "--slurp"');
    expect(script).toContain("pulls?state=open&per_page=100");
    expect(script).toContain("check-runs?filter=latest&per_page=100");
    expect(script).toContain('appSlug: String(check?.app?.slug ?? "")');
    expect(script).toContain("statuses?per_page=100");
    expect(script).toContain("reviews?per_page=100");
    expect(script).toContain("reviewThreads(first:100,after:$endCursor)");
    expect(script).toContain("actions/workflows/central-review.yml/runs?event=repository_dispatch&per_page=100");
    expect(script).toContain('event_type: "noema-review"');
    expect(script).toContain('merge_method: "squash"');
    expect(script).toContain("sha: expectedHeadSha");
    expect(script).toContain("live.head.sha !== expectedHeadSha");
    expect(script).toContain("live.head.repo.full_name !== repository");
  });

  it("writes a bounded report and post-action queue outputs without exposing tokens", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    expect(script).toContain("open_pull_request_count=");
    expect(script).toContain("remaining_open_pull_request_count=");
    expect(script).toContain("report_path=");
    expect(script).toContain("remainingOpenPullRequestCount");
    expect(script).toContain("MAX_ERROR_CHARS");
    expect(script).not.toContain("GH_TOKEN");
    expect(script).not.toContain("GITHUB_TOKEN");
  });

  it("documents the operator contract and buyer-visible governance boundaries", () => {
    const readme = readFileSync("README.md", "utf8");
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combined = `${readme}\n${guide}\n${changelog}`;

    for (const requiredText of [
      ".github/workflows/hourly-commercial-readiness.yml",
      "commercial-readiness-loop-report",
      "SHA-bound",
      "verify",
      "reviewer",
      "scorecard",
      "osv-scan",
      "trivy-fs",
      "dependency-review",
      "issue #27",
      "issue #9",
    ]) {
      expect(combined).toContain(requiredText);
    }
    expect(guide).toContain("review-dependent checks");
    expect(guide).toContain("production KPI");
    expect(guide).toContain("revenue evidence");
  });
});
