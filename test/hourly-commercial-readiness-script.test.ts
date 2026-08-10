import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGhSubprocessEnvironment,
  flattenArrayPages,
  hasActiveNoemaReviewRun,
  latestCheckRunsBySuite,
  latestReviewStates,
  parseNoemaReviewDecision,
} from "../scripts/hourly-commercial-readiness.mjs";

const repository = "ContextualWisdomLab/noema";
const headSha = "b".repeat(40);
const trustedNoemaReviewerLogin = "noema-reviewer[bot]";

function review({
  login = trustedNoemaReviewerLogin,
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

  it("keeps only the newest rerun within one check suite", () => {
    expect(latestCheckRunsBySuite([
      {
        id: 100,
        name: "verify",
        status: "completed",
        conclusion: "failure",
        completed_at: "2026-08-03T00:00:00Z",
        app: { slug: "github-actions" },
        check_suite: { id: 50 },
      },
      {
        id: 101,
        name: "verify",
        status: "completed",
        conclusion: "success",
        completed_at: "2026-08-03T00:05:00Z",
        app: { slug: "github-actions" },
        check_suite: { id: 50 },
      },
    ])).toEqual([
      expect.objectContaining({ id: 101, conclusion: "success" }),
    ]);
  });

  it("keeps a higher-id queued rerun even before GitHub assigns timestamps", () => {
    expect(latestCheckRunsBySuite([
      {
        id: 100,
        name: "verify",
        status: "completed",
        conclusion: "success",
        completed_at: "2026-08-03T00:05:00Z",
        app: { slug: "github-actions" },
        check_suite: { id: 50 },
      },
      {
        id: 101,
        name: "verify",
        status: "queued",
        conclusion: null,
        started_at: null,
        completed_at: null,
        app: { slug: "github-actions" },
        check_suite: { id: 50 },
      },
    ])).toEqual([
      expect.objectContaining({ id: 101, status: "queued" }),
    ]);
  });

  it.each([
    {
      checkRuns: [
        { id: 1, name: "verify", app: { slug: "github-actions" }, check_suite: null },
      ],
    },
    {
      checkRuns: [
        { id: 2, name: "", app: { slug: "github-actions" }, check_suite: { id: 50 } },
      ],
    },
    {
      checkRuns: [
        { id: 3, name: "verify", app: null, check_suite: { id: 50 } },
      ],
    },
  ])("fails closed on incomplete check-run identity metadata", ({ checkRuns }) => {
    expect(() => latestCheckRunsBySuite(checkRuns)).toThrow(
      "Check run identity metadata is incomplete",
    );
  });

  it("preserves same-name checks from different current suites", () => {
    expect(latestCheckRunsBySuite([
      {
        id: 101,
        name: "verify",
        status: "completed",
        conclusion: "success",
        completed_at: "2026-08-03T00:05:00Z",
        app: { slug: "github-actions" },
        check_suite: { id: 50 },
      },
      {
        id: 201,
        name: "verify",
        status: "queued",
        conclusion: null,
        started_at: "2026-08-03T00:06:00Z",
        app: { slug: "github-actions" },
        check_suite: { id: 60 },
      },
    ])).toHaveLength(2);
  });

  it("requires the exact configured reviewer login, current-head marker, and App credential", () => {
    expect(
      parseNoemaReviewDecision([review()], headSha, trustedNoemaReviewerLogin),
    ).toBe("approve");
    expect(
      parseNoemaReviewDecision(
        [review({ login: "human", type: "User" })],
        headSha,
        trustedNoemaReviewerLogin,
      ),
    ).toBeNull();
    expect(
      parseNoemaReviewDecision(
        [review({ login: "other-app[bot]" })],
        headSha,
        trustedNoemaReviewerLogin,
      ),
    ).toBeNull();
    expect(
      parseNoemaReviewDecision(
        [review({ login: "noema-spoof[bot]" })],
        headSha,
        trustedNoemaReviewerLogin,
      ),
    ).toBeNull();
    expect(
      parseNoemaReviewDecision([
        review({
          body: `<!-- noema-review-gate head_sha=${headSha} decision=approve -->`,
        }),
      ], headSha, trustedNoemaReviewerLogin),
    ).toBeNull();
    expect(
      parseNoemaReviewDecision([
        review({
          body: `- Reviewer credential: \`noema-github-app\`\n<!-- noema-review-gate head_sha=${"c".repeat(40)} decision=approve -->`,
        }),
      ], headSha, trustedNoemaReviewerLogin),
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

    expect(
      parseNoemaReviewDecision(reviews, headSha, trustedNoemaReviewerLogin),
    ).toBe("request_changes");
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

  it("passes only explicit GitHub CLI authority into child processes", () => {
    expect(createGhSubprocessEnvironment({
      PATH: "/trusted/bin",
      GH_TOKEN: "read-only-maintainer-token",
      GITHUB_TOKEN: "ambient-workflow-token",
      NVIDIA_NIM_API_KEY: "model-secret",
      NOEMA_MAINTAINER_APP_PRIVATE_KEY: "maintainer-private-key",
      NOEMA_REVIEWER_APP_PRIVATE_KEY: "reviewer-private-key",
      NOEMA_REVIEWER_LOGIN: "reviewer[bot]",
      CLOUDFLARE_API_TOKEN: "cloudflare-secret",
      HTTPS_PROXY: "http://proxy.invalid",
      HTTP_PROXY: "http://proxy.invalid",
      ALL_PROXY: "socks5://proxy.invalid",
      HOME: "/credential-bearing-home",
      NODE_OPTIONS: "--require /tmp/preload.cjs",
      NOEMA_MAINTENANCE_ENABLED: "true",
    })).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
      PATH: "/trusted/bin",
      GH_TOKEN: "read-only-maintainer-token",
    });

    expect(createGhSubprocessEnvironment({})).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
  });

  it("uses shell-free complete pagination and exact-head write contracts", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    expect(script).toContain('spawnSync("gh"');
    expect(script).toContain("shell: false");
    expect(script).toContain("env: createGhSubprocessEnvironment()");
    expect(script).not.toContain("env: process.env");
    expect(script).toContain('"--paginate", "--slurp"');
    expect(script).toContain("pulls?state=open&per_page=100");
    expect(script).toContain("check-runs?filter=all&per_page=100");
    expect(script).not.toContain("check-runs?filter=latest");
    expect(script).toContain("latestCheckRunsBySuite(");
    expect(script).toContain('appSlug: String(check?.app?.slug ?? "")');
    expect(script).toContain("statuses?per_page=100");
    expect(script).toContain("reviews?per_page=100");
    expect(script).toContain("reviewThreads(first:100,after:$endCursor)");
    expect(script).toContain("actions/workflows/central-review.yml/runs?event=repository_dispatch&per_page=100");
    expect(script).toContain("NOEMA_REVIEWER_LOGIN");
    expect(script).toContain('event_type: "noema-review"');
    expect(script).toContain('merge_method: "squash"');
    expect(script).toContain("sha: expectedHeadSha");
    expect(script).toContain("live?.head?.sha !== expectedHeadSha");
    expect(script).toContain("live?.head?.repo?.full_name !== repository");
  });

  it("writes a bounded report and post-action queue outputs without embedding ambient token names", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    expect(script).toContain("open_pull_request_count=");
    expect(script).toContain("remaining_open_pull_request_count=");
    expect(script).toContain("report_path=");
    expect(script).toContain("remainingOpenPullRequestCount");
    expect(script).toContain("MAX_ERROR_CHARS");
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
      "NOEMA_REVIEWER_LOGIN",
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
