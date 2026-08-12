#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluatePullRequest } from "./lib/commercial-readiness-loop.mjs";

const MAX_ERROR_CHARS = 4_000;
const MAX_REPORT_DETAIL_CHARS = 1_000;
const MAX_GH_OUTPUT_BYTES = 16 * 1024 * 1024;
const repositoryPattern = /^ContextualWisdomLab\/[A-Za-z0-9_.-]+$/;
const botLoginPattern = /^[A-Za-z0-9-]+\[bot\]$/;
const fullShaPattern = /^[0-9a-f]{40}$/i;
const noemaMarkerPattern = /<!--\s*noema-review-gate\s+head_sha=([0-9a-f]{40})\s+decision=(approve|request_changes|blocked)\s*-->/gi;
const noemaCredentialMarker = "Reviewer credential: `noema-github-app`";
const reviewThreadQuery = "query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$endCursor){nodes{isResolved}pageInfo{hasNextPage endCursor}}}}}";
const activeWorkflowRunStatuses = new Set([
  "requested",
  "waiting",
  "pending",
  "queued",
  "in_progress",
]);

function bound(value, limit = MAX_REPORT_DETAIL_CHARS) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function redactSensitiveValue(value, sensitiveValues = []) {
  let redacted = String(value ?? "");
  for (const sensitiveValue of Array.isArray(sensitiveValues) ? sensitiveValues : []) {
    if (typeof sensitiveValue !== "string" || sensitiveValue.length === 0) {
      continue;
    }
    redacted = redacted.split(sensitiveValue).join("[REDACTED]");
  }
  return redacted;
}

export function createGhSubprocessEnvironment(sourceEnvironment) {
  const childEnvironment = {
    GH_HOST: "github.com",
    NO_COLOR: "1",
  };
  if (typeof sourceEnvironment.PATH === "string" && sourceEnvironment.PATH.length > 0) {
    childEnvironment.PATH = sourceEnvironment.PATH;
  }
  if (typeof sourceEnvironment.GH_TOKEN === "string" && sourceEnvironment.GH_TOKEN.length > 0) {
    childEnvironment.GH_TOKEN = sourceEnvironment.GH_TOKEN;
  }
  return childEnvironment;
}

function runGh(args, { input } = {}) {
  const childEnvironment = createGhSubprocessEnvironment({
    PATH: process.env.PATH,
    GH_TOKEN: process.env.GH_TOKEN,
  });
  const completed = spawnSync("gh", args, {
    encoding: "utf8",
    env: childEnvironment,
    input,
    maxBuffer: MAX_GH_OUTPUT_BYTES,
    shell: false,
  });
  if (completed.error) {
    const detail = redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI could not start: ${bound(detail, MAX_ERROR_CHARS)}`);
  }
  if (completed.status !== 0) {
    const rawDetail = completed.stderr || completed.stdout || `exit ${completed.status}`;
    const detail = redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN]);
    throw new Error(`GitHub CLI failed: ${bound(detail, MAX_ERROR_CHARS)}`);
  }
  return completed.stdout.trim();
}

function runGhJson(args, options) {
  const raw = runGh(args, options);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`GitHub CLI returned invalid JSON: ${bound(error.message, MAX_ERROR_CHARS)}`);
  }
}

export function flattenArrayPages(pages) {
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated GitHub response must be an array of pages.");
  }
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) {
      throw new TypeError("Each paginated GitHub array page must be an array.");
    }
    return page;
  });
}

function checkRunTimestamp(check) {
  return Math.max(
    Date.parse(check?.completed_at || "") || 0,
    Date.parse(check?.started_at || "") || 0,
  );
}

function checkRunChronologicalOrder(left, right) {
  const leftId = Number(left?.id);
  const rightId = Number(right?.id);
  if (
    Number.isSafeInteger(leftId)
    && Number.isSafeInteger(rightId)
    && leftId !== rightId
  ) {
    return leftId - rightId;
  }
  const timeDelta = checkRunTimestamp(left) - checkRunTimestamp(right);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return leftId - rightId;
}

function checkRunSuiteKey(check) {
  const checkId = Number(check?.id);
  const suiteId = Number(check?.check_suite?.id);
  const name = String(check?.name ?? "").trim();
  const appSlug = String(check?.app?.slug ?? "").trim().toLowerCase();
  if (
    !Number.isSafeInteger(checkId)
    || checkId <= 0
    || !Number.isSafeInteger(suiteId)
    || suiteId <= 0
    || !name
    || !appSlug
  ) {
    return null;
  }
  return `${suiteId}\u0000${appSlug}\u0000${name}`;
}

export function latestCheckRunsBySuite(checkRuns) {
  const latestBySuite = new Map();
  for (const check of Array.isArray(checkRuns) ? checkRuns : []) {
    const key = checkRunSuiteKey(check);
    if (!key) {
      throw new TypeError(
        `Check run identity metadata is incomplete for id ${String(check?.id ?? "missing")}.`,
      );
    }
    const current = latestBySuite.get(key);
    if (!current || checkRunChronologicalOrder(current, check) < 0) {
      latestBySuite.set(key, check);
    }
  }
  return [...latestBySuite.values()].sort((left, right) => {
    const nameDelta = String(left?.name ?? "").localeCompare(String(right?.name ?? ""));
    if (nameDelta !== 0) {
      return nameDelta;
    }
    const suiteDelta = Number(left?.check_suite?.id || 0) - Number(right?.check_suite?.id || 0);
    if (suiteDelta !== 0) {
      return suiteDelta;
    }
    return Number(left?.id || 0) - Number(right?.id || 0);
  });
}

function paginatedArray(endpoint) {
  const pages = runGhJson(["api", "--paginate", "--slurp", endpoint]);
  return flattenArrayPages(pages);
}

function paginatedObjectItems(endpoint, key) {
  const pages = runGhJson(["api", "--paginate", "--slurp", endpoint]);
  if (!Array.isArray(pages)) {
    throw new TypeError("Paginated GitHub response must be an array of object pages.");
  }
  return pages.flatMap((page) => {
    const items = page?.[key];
    if (!Array.isArray(items)) {
      throw new TypeError(`Paginated GitHub page is missing ${key}.`);
    }
    return items;
  });
}

function chronologicalReviewOrder(left, right) {
  const leftTime = Date.parse(left?.submitted_at || "") || 0;
  const rightTime = Date.parse(right?.submitted_at || "") || 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return Number(left?.id || 0) - Number(right?.id || 0);
}

function isTrustedNoemaBot(review, trustedReviewerLogin) {
  const login = String(review?.user?.login ?? "").toLowerCase();
  const expectedLogin = String(trustedReviewerLogin ?? "").toLowerCase();
  return Boolean(expectedLogin)
    && review?.user?.type === "Bot"
    && login === expectedLogin;
}

export function latestReviewStates(reviews) {
  const decisions = new Map();
  for (const review of [...(Array.isArray(reviews) ? reviews : [])].sort(chronologicalReviewOrder)) {
    const reviewer = String(review?.user?.login ?? "").trim();
    const state = String(review?.state ?? "").toUpperCase();
    if (!reviewer) {
      continue;
    }
    if (state === "DISMISSED") {
      decisions.delete(reviewer);
    } else if (state === "APPROVED" || state === "CHANGES_REQUESTED") {
      decisions.set(reviewer, { reviewer, state });
    }
  }
  return [...decisions.values()].sort((left, right) => left.reviewer.localeCompare(right.reviewer));
}

export function parseNoemaReviewDecision(reviews, expectedHeadSha, trustedReviewerLogin) {
  if (
    !fullShaPattern.test(String(expectedHeadSha ?? ""))
    || !botLoginPattern.test(String(trustedReviewerLogin ?? ""))
  ) {
    return null;
  }
  const candidates = [];
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (!isTrustedNoemaBot(review, trustedReviewerLogin)) {
      continue;
    }
    if (review?.commit_id && review.commit_id !== expectedHeadSha) {
      continue;
    }
    const body = String(review?.body ?? "");
    if (!body.includes(noemaCredentialMarker)) {
      continue;
    }
    noemaMarkerPattern.lastIndex = 0;
    let marker;
    let latestMarker = null;
    while ((marker = noemaMarkerPattern.exec(body)) !== null) {
      latestMarker = marker;
    }
    if (!latestMarker || latestMarker[1].toLowerCase() !== expectedHeadSha.toLowerCase()) {
      continue;
    }
    const decision = latestMarker[2].toLowerCase();
    const state = String(review?.state ?? "").toUpperCase();
    const compatible = decision === "approve"
      ? state === "APPROVED"
      : state === "CHANGES_REQUESTED";
    if (!compatible) {
      continue;
    }
    candidates.push({ ...review, decision });
  }
  candidates.sort(chronologicalReviewOrder);
  return candidates.at(-1)?.decision ?? null;
}

export function latestStatuses(statuses) {
  const latestByContext = new Map();
  const ordered = [...(Array.isArray(statuses) ? statuses : [])].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || "") || 0;
    const rightTime = Date.parse(right?.created_at || "") || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return Number(right?.id || 0) - Number(left?.id || 0);
  });
  for (const status of ordered) {
    const context = String(status?.context ?? "").trim();
    if (context && !latestByContext.has(context)) {
      latestByContext.set(context, {
        context,
        state: String(status?.state ?? "").toLowerCase(),
      });
    }
  }
  return [...latestByContext.values()].sort((left, right) => left.context.localeCompare(right.context));
}

export function hasActiveNoemaReviewRun(runs, repository, pullNumber, headSha) {
  if (
    !repositoryPattern.test(String(repository ?? ""))
    || !Number.isInteger(Number(pullNumber))
    || Number(pullNumber) <= 0
    || !fullShaPattern.test(String(headSha ?? ""))
  ) {
    return false;
  }
  const expectedTitle = `Noema central review ${repository}#${Number(pullNumber)}@${headSha}`;
  return (Array.isArray(runs) ? runs : []).some((run) => (
    run?.event === "repository_dispatch"
    && activeWorkflowRunStatuses.has(String(run?.status ?? "").toLowerCase())
    && run?.display_title === expectedTitle
  ));
}

function fetchUnresolvedThreadCount(repository, pullNumber) {
  const [owner, name] = repository.split("/", 2);
  const pages = runGhJson([
    "api",
    "graphql",
    "--paginate",
    "--slurp",
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${pullNumber}`,
    "-f",
    `query=${reviewThreadQuery}`,
  ]);
  if (!Array.isArray(pages)) {
    throw new TypeError("Review-thread GraphQL response must contain every page.");
  }
  return pages.reduce((count, page) => {
    const threads = page?.data?.repository?.pullRequest?.reviewThreads?.nodes;
    if (!Array.isArray(threads)) {
      throw new TypeError("Review-thread GraphQL page is incomplete.");
    }
    return count + threads.filter((thread) => thread?.isResolved !== true).length;
  }, 0);
}

function fetchPullRequest(repository, pullNumber) {
  return runGhJson(["api", `repos/${repository}/pulls/${pullNumber}`]);
}

function listOpenPullRequests(repository) {
  return paginatedArray(`repos/${repository}/pulls?state=open&per_page=100`);
}

function fetchPullRequestSnapshot(repository, pullNumber, trustedNoemaReviewerLogin) {
  const pull = fetchPullRequest(repository, pullNumber);
  const headSha = String(pull?.head?.sha ?? "");
  if (!fullShaPattern.test(headSha)) {
    throw new Error(`Pull request #${pullNumber} did not expose a full head SHA.`);
  }
  const checkRuns = latestCheckRunsBySuite(paginatedObjectItems(
    `repos/${repository}/commits/${headSha}/check-runs?filter=all&per_page=100`,
    "check_runs",
  )).map((check) => ({
    name: String(check?.name ?? ""),
    appSlug: String(check?.app?.slug ?? ""),
    status: String(check?.status ?? ""),
    conclusion: check?.conclusion == null ? null : String(check.conclusion),
  }));
  const rawStatuses = paginatedArray(
    `repos/${repository}/commits/${headSha}/statuses?per_page=100`,
  );
  const reviews = paginatedArray(
    `repos/${repository}/pulls/${pullNumber}/reviews?per_page=100`,
  );

  return {
    repository,
    number: pullNumber,
    title: bound(pull?.title || `Pull request #${pullNumber}`, 240),
    state: String(pull?.state ?? ""),
    draft: pull?.draft,
    baseRef: String(pull?.base?.ref ?? ""),
    headRepository: String(pull?.head?.repo?.full_name ?? ""),
    headSha,
    mergeable: pull?.mergeable,
    mergeableState: String(pull?.mergeable_state ?? ""),
    unresolvedThreadCount: fetchUnresolvedThreadCount(repository, pullNumber),
    latestReviewStates: latestReviewStates(reviews),
    noemaReviewDecision: parseNoemaReviewDecision(
      reviews,
      headSha,
      trustedNoemaReviewerLogin,
    ),
    checkRuns,
    statuses: latestStatuses(rawStatuses),
  };
}

function assertLiveHead(repository, pullNumber, expectedHeadSha) {
  const live = fetchPullRequest(repository, pullNumber);
  if (
    !live
    || live?.state !== "open"
    || live?.base?.ref !== "main"
    || live?.head?.sha !== expectedHeadSha
    || live?.head?.repo?.full_name !== repository
  ) {
    throw new Error(
      `Pull request #${pullNumber} changed before the write; expected open main ${expectedHeadSha}.`,
    );
  }
}

function fetchCentralReviewRuns(repository) {
  return paginatedObjectItems(
    `repos/${repository}/actions/workflows/central-review.yml/runs?event=repository_dispatch&per_page=100`,
    "workflow_runs",
  );
}

function dispatchNoemaReview(repository, pullNumber, expectedHeadSha) {
  assertLiveHead(repository, pullNumber, expectedHeadSha);
  const payload = {
    event_type: "noema-review",
    client_payload: {
      target_repository: repository,
      pr_number: pullNumber,
      pr_head_sha: expectedHeadSha,
    },
  };
  runGh(
    ["api", "-X", "POST", `repos/${repository}/dispatches`, "--input", "-"],
    { input: JSON.stringify(payload) },
  );
}

function mergePullRequest(repository, snapshot, trustedNoemaReviewerLogin) {
  const expectedHeadSha = snapshot.headSha;
  assertLiveHead(repository, snapshot.number, expectedHeadSha);
  const freshSnapshot = fetchPullRequestSnapshot(
    repository,
    snapshot.number,
    trustedNoemaReviewerLogin,
  );
  const freshDecision = evaluatePullRequest(freshSnapshot);
  if (freshSnapshot.headSha !== expectedHeadSha || freshDecision.action !== "merge") {
    throw new Error(
      `Pull request #${snapshot.number} no longer satisfies the exact-head merge decision.`,
    );
  }
  const payload = {
    commit_title: `${snapshot.title} (#${snapshot.number})`,
    commit_message: "Merged by Noema's hourly commercial-readiness loop after exact-head validation.",
    merge_method: "squash",
    sha: expectedHeadSha,
  };
  const result = runGhJson(
    ["api", "-X", "PUT", `repos/${repository}/pulls/${snapshot.number}/merge`, "--input", "-"],
    { input: JSON.stringify(payload) },
  );
  if (result?.merged !== true) {
    throw new Error(
      `GitHub refused pull request #${snapshot.number}: ${bound(result?.message || "unknown reason")}`,
    );
  }
  return String(result.sha ?? "");
}

function parseArguments(argv) {
  let apply = false;
  let reportPath = "artifacts/commercial-readiness/hourly-loop-report.json";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--report") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--report requires a file path.");
      }
      reportPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { apply, reportPath: resolve(reportPath) };
}

function appendWorkflowOutputs(reportPath, report) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(
      outputPath,
      [
        `open_pull_request_count=${report.openPullRequestCount}`,
        `remaining_open_pull_request_count=${report.remainingOpenPullRequestCount ?? "unknown"}`,
        `report_path=${reportPath}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

function writeSummary(report) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  const lines = [
    "## Noema commercial-readiness loop",
    "",
    `- Open pull requests inspected: ${report.openPullRequestCount}`,
    `- Open pull requests remaining: ${report.remainingOpenPullRequestCount ?? "unknown"}`,
    `- Apply mode: ${report.apply ? "enabled" : "dry run"}`,
    "",
  ];
  if (report.results.length === 0) {
    lines.push("No pull requests were open; the workflow may continue with report-only readiness audits.");
  } else {
    lines.push("| PR | Result | Detail |", "| --- | --- | --- |");
    for (const result of report.results) {
      const detail = result.reasons?.map((reason) => reason.code).join(", ")
        || result.detail
        || "validated";
      lines.push(
        `| #${result.number} | ${result.result} | ${bound(detail, 300).replaceAll("|", "\\|")} |`,
      );
    }
  }
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function writeReport(reportPath, report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  appendWorkflowOutputs(reportPath, report);
  writeSummary(report);
}

export function main(argv = process.argv.slice(2)) {
  const { apply, reportPath } = parseArguments(argv);
  const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
  if (!repositoryPattern.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must identify a ContextualWisdomLab repository.");
  }
  const trustedNoemaReviewerLogin = String(process.env.NOEMA_REVIEWER_LOGIN ?? "").trim();
  if (!botLoginPattern.test(trustedNoemaReviewerLogin)) {
    throw new Error("NOEMA_REVIEWER_LOGIN must be the exact trusted GitHub App bot login ending in [bot].");
  }

  const openPullRequests = listOpenPullRequests(repository);
  const report = {
    schemaVersion: 1,
    repository,
    generatedAt: new Date().toISOString(),
    apply,
    openPullRequestCount: openPullRequests.length,
    remainingOpenPullRequestCount: null,
    results: [],
  };
  const operationalErrors = [];

  for (const pull of openPullRequests) {
    const pullNumber = Number(pull?.number);
    try {
      if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
        throw new Error("Open pull-request listing contained an invalid number.");
      }
      const snapshot = fetchPullRequestSnapshot(
        repository,
        pullNumber,
        trustedNoemaReviewerLogin,
      );
      const decision = evaluatePullRequest(snapshot);
      const result = {
        number: pullNumber,
        headSha: snapshot.headSha,
        decision: decision.action,
        result: decision.action,
        reasons: decision.reasons,
      };

      if (apply && decision.action === "request_review") {
        const activeRuns = fetchCentralReviewRuns(repository);
        if (hasActiveNoemaReviewRun(activeRuns, repository, pullNumber, snapshot.headSha)) {
          result.result = "review_in_progress";
          result.detail = "An exact-target Noema central review is already active.";
        } else {
          dispatchNoemaReview(repository, pullNumber, snapshot.headSha);
          result.result = "review_dispatched";
          result.detail = "Dispatched trusted Noema review for the exact current head.";
        }
      } else if (apply && decision.action === "merge") {
        const mergeSha = mergePullRequest(
          repository,
          snapshot,
          trustedNoemaReviewerLogin,
        );
        result.result = "merged";
        result.detail = `Squash-merged at ${mergeSha || "GitHub-generated commit"}.`;
      }
      report.results.push(result);
    } catch (error) {
      const detail = bound(error?.message || error, MAX_ERROR_CHARS);
      report.results.push({
        number: Number.isInteger(pullNumber) ? pullNumber : null,
        result: "operational_error",
        reasons: [{ code: "operational_error", detail }],
      });
      operationalErrors.push(detail);
    }
  }

  try {
    report.remainingOpenPullRequestCount = listOpenPullRequests(repository).length;
  } catch (error) {
    const detail = bound(error?.message || error, MAX_ERROR_CHARS);
    operationalErrors.push(detail);
    report.results.push({
      number: null,
      result: "operational_error",
      reasons: [{ code: "remaining_queue_unavailable", detail }],
    });
  }

  writeReport(reportPath, report);
  console.log(JSON.stringify({
    repository,
    openPullRequestCount: report.openPullRequestCount,
    remainingOpenPullRequestCount: report.remainingOpenPullRequestCount,
    results: report.results.map(({ number, result }) => ({ number, result })),
    reportPath,
  }));

  if (operationalErrors.length > 0) {
    throw new Error(`${operationalErrors.length} operational error(s) occurred; inspect ${reportPath}.`);
  }
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(bound(error?.message || error, MAX_ERROR_CHARS));
    process.exitCode = 1;
  }
}
