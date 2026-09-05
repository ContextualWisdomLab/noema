import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluatePullRequest,
  latestCheckRunsBySuite,
  main,
  redactSensitiveValue,
  shouldDispatchProductDevelopment,
} from "../scripts/hourly-commercial-readiness.mjs";

const roots: string[] = [];
const originalEnvironment = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
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
    number: 77,
    title: "fix: bounded current-head repair",
    headSha: "a".repeat(40),
    isDraft: false,
    mergeable: "MERGEABLE",
    state: "OPEN",
    reviewDecision: "APPROVED",
    checkSuites: [
      { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Security Scan", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "patch-validator-image", status: "COMPLETED", conclusion: "SUCCESS" },
    ],
    statuses: [],
    reviews: [
      {
        author: "noema-reviewer[bot]",
        state: "APPROVED",
        commitId: "a".repeat(40),
      },
    ],
    unresolvedThreads: 0,
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
        app: { slug: "github-actions" },
      },
      {
        id: 11,
        name: "ci",
        status: "in_progress",
        conclusion: null,
        app: { slug: "github-actions" },
      },
    ]);

    expect(latest).toEqual([
      expect.objectContaining({ id: 11, name: "ci", status: "in_progress" }),
    ]);
  });

  it("fails closed when exact-head required checks are missing", () => {
    const decision = evaluatePullRequest(snapshot({
      checkSuites: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
    }));

    expect(decision.action).toBe("hold");
    expect(decision.reasons.map((reason) => reason.code)).toContain("required_check_missing");
  });

  it("requests an exact-head reviewer when all independent gates are green", () => {
    const decision = evaluatePullRequest(snapshot({ reviews: [] }));

    expect(decision.action).toBe("request_review");
    expect(decision.reasons).toEqual([
      expect.objectContaining({ code: "trusted_review_missing" }),
    ]);
  });

  it("merges only with exact-head trusted approval and no unresolved threads", () => {
    const decision = evaluatePullRequest(snapshot());

    expect(decision.action).toBe("merge");
    expect(decision.reasons).toEqual([]);
  });

  it("rejects stale trusted approval", () => {
    const decision = evaluatePullRequest(snapshot({
      reviews: [
        {
          author: "noema-reviewer[bot]",
          state: "APPROVED",
          commitId: "b".repeat(40),
        },
      ],
    }));

    expect(decision.action).toBe("request_review");
  });

  it("holds when a current-head approval has unresolved review threads", () => {
    const decision = evaluatePullRequest(snapshot({ unresolvedThreads: 1 }));

    expect(decision.action).toBe("hold");
    expect(decision.reasons.map((reason) => reason.code)).toContain("unresolved_review_thread");
  });

  it("holds draft and non-mergeable pull requests", () => {
    expect(evaluatePullRequest(snapshot({ isDraft: true })).action).toBe("hold");
    expect(evaluatePullRequest(snapshot({ mergeable: "CONFLICTING" })).action).toBe("hold");
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
    const outputPath = join(roots.at(-1)!, "github-output.txt");
    const summaryPath = join(roots.at(-1)!, "summary.md");
    process.env.GITHUB_OUTPUT = outputPath;
    process.env.GITHUB_STEP_SUMMARY = summaryPath;

    appendFileSync(outputPath, "preexisting=value\n", "utf8");
    appendFileSync(summaryPath, "preexisting summary\n", "utf8");

    const report = {
      schemaVersion: 1,
      repository: "ContextualWisdomLab/noema",
      generatedAt: new Date(0).toISOString(),
      apply: false,
      openPullRequestCount: 0,
      remainingOpenPullRequestCount: 0,
      results: [],
    };
    const originalSpawn = vi.spyOn(await import("node:child_process"), "spawnSync");
    originalSpawn.mockReturnValue({
      status: 0,
      stdout: "[]",
      stderr: "",
      pid: 1,
      output: [null, "[]", ""],
      signal: null,
    } as never);
    process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/noema";
    process.env.NOEMA_REVIEWER_LOGIN = "noema-reviewer[bot]";

    main(["--report", reportPath]);

    const persisted = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(persisted.openPullRequestCount).toBe(report.openPullRequestCount);
    expect(readFileSync(outputPath, "utf8")).toContain("open_pull_request_count=0");
    expect(readFileSync(summaryPath, "utf8")).toContain("Noema commercial-readiness loop");
  });
});