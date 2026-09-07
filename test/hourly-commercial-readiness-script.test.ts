import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluatePullRequest,
  REQUIRED_CHECK_NAMES,
} from "../scripts/lib/commercial-readiness-loop.mjs";
import {
  latestCheckRunsBySuite,
  main,
  parseNoemaReviewDecision,
  redactSensitiveValue,
  shouldDispatchProductDevelopment,
} from "../scripts/hourly-commercial-readiness.mjs";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

const roots: string[] = [];
const originalEnvironment = { ...process.env };

const requiredCheckRuns = REQUIRED_CHECK_NAMES.map((name) => ({
  name,
  appSlug: "github-actions",
  status: "completed",
  conclusion: "success",
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(spawnSync).mockReset();
  process.env = { ...originalEnvironment };
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

function tempReportPath(): string {
  const root = mkdtempSync(join(tmpdir(), "noema-commercial-readiness-"));
  roots.push(root);
  return join(root, "report.json");
}

function snapshot(overrides = {}) {
  return {
    repository: "ContextualWisdomLab/noema",
    number: 77,
    title: "fix: bounded current-head repair",
    state: "open",
    draft: false,
    baseRef: "main",
    headRepository: "ContextualWisdomLab/noema",
    headSha: "a".repeat(40),
    mergeable: true,
    mergeableState: "clean",
    unresolvedThreadCount: 0,
    latestReviewStates: [],
    noemaReviewDecision: "approve",
    checkRuns: requiredCheckRuns.map((check) => ({ ...check })),
    statuses: [],
    ...overrides,
  };
}

describe("hourly commercial readiness script", () => {
  it("prefers the latest check run within a suite and rejects older success", () => {
    const latest = latestCheckRunsBySuite([
      {
        id: 10,
        name: "ci",
        status: "completed",
        conclusion: "success",
        check_suite: { id: 30 },
        app: { slug: "github-actions" },
      },
      {
        id: 11,
        name: "ci",
        status: "in_progress",
        conclusion: null,
        check_suite: { id: 30 },
        app: { slug: "github-actions" },
      },
    ]);

    expect(latest).toEqual([
      expect.objectContaining({ id: 11, name: "ci", status: "in_progress" }),
    ]);
  });

  it("fails closed when a check run omits suite identity metadata", () => {
    expect(() => latestCheckRunsBySuite([
      {
        id: 10,
        name: "ci",
        status: "completed",
        conclusion: "success",
        app: { slug: "github-actions" },
      },
    ])).toThrow("Check run identity metadata is incomplete for id 10.");
  });

  it("fails closed when exact-head required checks are missing", () => {
    const decision = evaluatePullRequest(snapshot({
      checkRuns: [{
        name: "verify",
        appSlug: "github-actions",
        status: "completed",
        conclusion: "success",
      }],
    }));

    expect(decision.action).toBe("blocked");
    expect(decision.reasons.map((reason) => reason.code)).toContain("required_check_missing");
  });

  it("requests an exact-head reviewer when all independent gates are green", () => {
    const decision = evaluatePullRequest(snapshot({ noemaReviewDecision: null }));

    expect(decision.action).toBe("request_review");
    expect(decision.reasons).toEqual([
      expect.objectContaining({ code: "noema_current_head_approval_missing" }),
    ]);
  });

  it("merges only with exact-head trusted approval and no unresolved threads", () => {
    const decision = evaluatePullRequest(snapshot());

    expect(decision.action).toBe("merge");
    expect(decision.reasons).toEqual([]);
  });

  it("rejects stale trusted approval", () => {
    const staleHead = "b".repeat(40);
    const currentHead = "a".repeat(40);
    const noemaReviewDecision = parseNoemaReviewDecision([
      {
        id: 99,
        submitted_at: "2026-09-05T00:00:00Z",
        commit_id: staleHead,
        state: "APPROVED",
        user: { login: "noema-reviewer[bot]", type: "Bot" },
        body: [
          "Reviewer credential: `noema-github-app`",
          `<!-- noema-review-gate head_sha=${staleHead} decision=approve -->`,
        ].join("\n"),
      },
    ], currentHead, "noema-reviewer[bot]");

    expect(noemaReviewDecision).toBeNull();
    expect(evaluatePullRequest(snapshot({ noemaReviewDecision })).action).toBe("request_review");
  });

  it("blocks when a current-head approval has unresolved review threads", () => {
    const decision = evaluatePullRequest(snapshot({ unresolvedThreadCount: 1 }));

    expect(decision.action).toBe("blocked");
    expect(decision.reasons.map((reason) => reason.code)).toContain("unresolved_review_threads");
  });

  it("blocks draft and non-mergeable pull requests", () => {
    expect(evaluatePullRequest(snapshot({ draft: true })).action).toBe("blocked");
    expect(evaluatePullRequest(snapshot({ mergeable: false })).action).toBe("blocked");
  });

  it("dispatches product development work-conservingly when apply mode has no operational error", () => {
    expect(shouldDispatchProductDevelopment(true, 0)).toBe(true);
    expect(shouldDispatchProductDevelopment(false, 0)).toBe(false);
    expect(shouldDispatchProductDevelopment(true, 1)).toBe(false);
    expect(shouldDispatchProductDevelopment(true, Number.NaN)).toBe(false);
  });

  it("redacts repeated sensitive values in diagnostics", () => {
    const token = "ghs_secret-value";
    const detail = `gh failed with ${token}; retry also exposed ${token}`;

    expect(redactSensitiveValue(detail, [token])).toBe(
      "gh failed with [REDACTED]; retry also exposed [REDACTED]",
    );
    expect(redactSensitiveValue(detail, ["", null, undefined, token])).not.toContain(token);
    expect(redactSensitiveValue("safe diagnostic", [])).toBe("safe diagnostic");
  });

  it("uses shell-free complete pagination and exact-head write contracts", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    expect(script).toContain('spawnSync("gh"');
    expect(script).toContain("shell: false");
    expect(script).toContain("env: childEnvironment");
    expect(script).not.toContain("env: process.env");
    expect(script).toContain(
      "redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN])",
    );
    expect(script).toContain("redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN])");
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
    expect(script).toContain("actions/workflows/hourly-product-development.yml/dispatches");
    expect(script).toContain('JSON.stringify({ ref: "main", inputs: { dry_run: "false" } })');
    expect(script).toContain("shouldDispatchProductDevelopment(apply, operationalErrors.length)");
    expect(script).not.toContain("report.remainingOpenPullRequestCount === 0");
    expect(script).toContain('merge_method: "squash"');
    expect(script).toContain("sha: expectedHeadSha");
    expect(script).toContain("live?.head?.sha !== expectedHeadSha");
    expect(script).toContain("live?.head?.repo?.full_name !== repository");
  });

  it("writes a bounded report and post-action queue outputs without ambient credential payloads", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    expect(script).toContain("open_pull_request_count=");
    expect(script).toContain("remaining_open_pull_request_count=");
    expect(script).toContain("report_path=");
    expect(script).toContain("remainingOpenPullRequestCount");
    expect(script).toContain("MAX_ERROR_CHARS");
    expect(script).not.toContain("GITHUB_TOKEN");
    expect(script).not.toContain("read-only-maintainer-token");
  });

  it("keeps report files private and appends explicit workflow outputs", () => {
    const reportPath = tempReportPath();
    const root = roots.at(-1)!;
    const outputPath = join(root, "github-output.txt");
    const summaryPath = join(root, "summary.md");
    const tokenPath = join(root, "maintainer-token");
    process.env.GITHUB_OUTPUT = outputPath;
    process.env.GITHUB_STEP_SUMMARY = summaryPath;
    process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/noema";
    process.env.NOEMA_REVIEWER_LOGIN = "noema-reviewer[bot]";
    process.env.NOEMA_MAINTAINER_TOKEN_PATH = tokenPath;

    appendFileSync(outputPath, "preexisting=value\n", "utf8");
    appendFileSync(summaryPath, "preexisting summary\n", "utf8");
    writeFileSync(tokenPath, "ghs_test-token", { encoding: "utf8", mode: 0o600 });

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: "[]",
      stderr: "",
      pid: 1,
      output: [null, "[]", ""],
      signal: null,
    } as never);

    const report = main(["--report", reportPath]);

    const persisted = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(persisted.openPullRequestCount).toBe(report.openPullRequestCount);
    expect(persisted.remainingOpenPullRequestCount).toBe(0);
    expect(statSync(reportPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(outputPath, "utf8")).toContain("open_pull_request_count=0");
    expect(readFileSync(summaryPath, "utf8")).toContain("Noema commercial-readiness loop");
  });
});
