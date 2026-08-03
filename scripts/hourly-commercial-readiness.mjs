#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluatePullRequest } from "./lib/commercial-readiness-loop.mjs";

const MAX_ERROR_CHARS = 2_000;
const MAX_REPORT_TEXT_CHARS = 1_000;
const MAX_GH_OUTPUT_BYTES = 32 * 1024 * 1024;
const repositoryPattern = /^ContextualWisdomLab\/[A-Za-z0-9_.-]+$/;
const fullShaPattern = /^[0-9a-f]{40}$/i;
const noemaMarkerPattern = /<!--\s*noema-review-gate\s+head_sha=([0-9a-f]{40})\s+decision=(approve|request_changes|blocked)\s*-->/gi;
const effectiveReviewStates = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

function bounded(value, limit = MAX_REPORT_TEXT_CHARS) {
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n[truncated ${text.length - limit} characters]`;
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${bounded(error.message, MAX_ERROR_CHARS)}`);
  }
}

function runGh(args, { input = undefined } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: process.env,
    input,
    maxBuffer: MAX_GH_OUTPUT_BYTES,
    shell: false,
  });
  if (result.error) {
    throw new Error(`Unable to execute gh: ${bounded(result.error.message, MAX_ERROR_CHARS)}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `gh ${args.slice(0, 4).join(" ")} failed with exit ${result.status}: ${bounded(result.stderr, MAX_ERROR_CHARS)}`,
    );
  }
  return result.stdout;
}

function runGhJson(args, options = {}) {
  const raw = runGh(args, options).trim();
  if (!raw) {
    throw new Error(`gh ${args.slice(0, 4).join(" ")} returned an empty JSON response.`);
  }
  return parseJson(raw, `gh ${args.slice(0, 4).join(" ")}`);
}

function paginatedJson(endpoint, extraArgs = []) {
  return runGhJson(["api", "--paginate", "--slurp", ...extraArgs, endpoint]);
}

export function flattenArrayPages(pages) {
  if (!Array.isArray(pages)) {
    throw new Error("Paginated GitHub response must be an array of pages.");
  }
  return pages.flatMap((page, index) => {
    if (!Array.isArray(page)) {
      throw new Error(`Paginated GitHub page ${index + 1} must be an array.`);
    }
    return page;
  });
}

function flattenCheckRunPages(pages) {
  if (!Array.isArray(pages)) {
    throw new Error("Paginated check-run response must be an array of pages.");
  }
  return pages.flatMap((page, index) => {
    if (!page || !Array.isArray(page.check_runs)) {
      throw new Error(`Paginated check-run page ${index + 1} is missing check_runs.`);
    }
    return page.check_runs;
  });
}

function itemOrder(item) {
  const timestamp = Date.parse(
    item?.submitted_at
      || item?.updated_at
      || item?.completed_at
      || item?.started_at
      || item?.created_at
      || "",
  );
  return [Number.isNaN(timestamp) ? 0 : timestamp, Number(item?.id) || 0];
}

function isNewer(candidate, current) {
  const [candidateTime, candidateId] = itemOrder(candidate);
  const [currentTime, currentId] = itemOrder(current);
  return candidateTime > currentTime || (candidateTime === currentTime && candidateId > currentId);
}

function latestBy(items, keyFor) {
  const latest = new Map();
  for (const item of items) {
    const key = String(keyFor(item) ?? "").trim();
    if (!key) continue;
    const current = latest.get(key);
    if (!current || isNewer(item, current)) {
      latest.set(key, item);
    }
  }
  return [...latest.values()];
}

export function latestReviewStates(reviews) {
  const latest = new Map();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const reviewer = String(review?.user?.login ?? "").trim();
    const state = String(review?.state ?? "").trim().toUpperCase();
    if (!reviewer || !effectiveReviewStates.has(state)) continue;
    const current = latest.get(reviewer);
    if (!current || isNewer(review, current)) {
      latest.set(reviewer, review);
    }
  }
  return [...latest.entries()]
    .filter(([, review]) => review.state === "APPROVED" || review.state === "CHANGES_REQUESTED")
    .map(([reviewer, review]) => ({ reviewer, state: review.state }))
    .sort((left, right) => left.reviewer.localeCompare(right.reviewer));
}

function isAuthenticatedNoemaBot(review) {
  const login = String(review?.user?.login ?? "").trim();
  const type = String(review?.user?.type ?? "").trim();
  return type === "Bot" && /noema/i.test(login);
}

export function parseNoemaReviewDecision(reviews, expectedHeadSha) {
  if (!fullShaPattern.test(String(expectedHeadSha ?? ""))) {
    return null;
  }
  const matching = [];
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (!isAuthenticatedNoemaBot(review)) continue;
    const matches = [...String(review?.body ?? "").matchAll(noemaMarkerPattern)];
    if (matches.length !== 1 || matches[0][1].toLowerCase() !== expectedHeadSha.toLowerCase()) {
      continue;
    }
    const decision = matches[0][2].toLowerCase();
    const reviewState = String(review?.state ?? "").toUpperCase();
    const stateMatchesDecision = decision === "approve"
      ? reviewState === "APPROVED"
      : reviewState === "CHANGES_REQUESTED";
    if (!stateMatchesDecision) continue;
    matching.push({ ...review, noemaDecision: decision });
  }
  const newest = matching.reduce(
    (current, candidate) => (!current || isNewer(candidate, current) ? candidate : current),
    null,
  );
  return newest?.noemaDecision ?? null;
}

function normalizeCheckRuns(checkRuns) {
  return latestBy(checkRuns, (check) => check?.name).map((check) => ({
    name: bounded(check.name, 200),
    status: String(check.status ?? "").toLowerCase(),
    conclusion: check.conclusion == null ? null : String(check.conclusion).toLowerCase(),
  }));
}

function normalizeStatuses(statuses) {
  return latestBy(statuses, (status) => status?.context).map((status) => ({
    context: bounded(status.context, 200),
    state: String(status.state ?? "").toLowerCase(),
  }));
}

function repositoryParts(repository) {
  const [owner, name] = repository.split("/", 2);
  return { owner, name };
}

function fetchPullRequest(repository, number) {
  return runGhJson(["api", `repos/${repository}/pulls/${number}`]);
}

function fetchOpenPullRequests(repository) {
  return flattenArrayPages(
    paginatedJson(`repos/${repository}/pulls?state=open&per_page=100&sort=created&direction=asc`),
  );
}

function fetchCheckRuns(repository, headSha) {
  const pages = paginatedJson(
    `repos/${repository}/commits/${headSha}/check-runs?filter=latest&per_page=100`,
    ["-H", "Accept: application/vnd.github+json"],
  );
  return normalizeCheckRuns(flattenCheckRunPages(pages));
}

function fetchStatuses(repository, headSha) {
  const pages = paginatedJson(`repos/${repository}/commits/${headSha}/statuses?per_page=100`);
  return normalizeStatuses(flattenArrayPages(pages));
}

function fetchReviews(repository, number) {
  return flattenArrayPages(
    paginatedJson(`repos/${repository}/pulls/${number}/reviews?per_page=100`),
  );
}

function fetchUnresolvedThreadCount(repository, number) {
  const { owner, name } = repositoryParts(repository);
  const query = "query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$endCursor){nodes{isResolved}pageInfo{hasNextPage endCursor}}}}}";
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
    `number=${number}`,
    "-f",
    `query=${query}`,
  ]);
  if (!Array.isArray(pages)) {
    throw new Error("Paginated review-thread response must be an array of pages.");
  }
  return pages.reduce((count, page, index) => {
    const nodes = page?.data?.repository?.pullRequest?.reviewThreads?.nodes;
    if (!Array.isArray(nodes)) {
      throw new Error(`Paginated review-thread page ${index + 1} is missing nodes.`);
    }
    return count + nodes.filter((thread) => thread?.isResolved !== true).length;
  }, 0);
}

function buildSnapshot(repository, number) {
  const pullRequest = fetchPullRequest(repository, number);
  const headSha = String(pullRequest?.head?.sha ?? "");
  if (!fullShaPattern.test(headSha)) {
    throw new Error(`Pull request #${number} returned an invalid head SHA.`);
  }
  const reviews = fetchReviews(repository, number);
  return {
    repository,
    number,
    state: pullRequest.state,
    draft: pullRequest.draft,
    baseRef: pullRequest?.base?.ref,
    headRepository: pullRequest?.head?.repo?.full_name,
    headSha,
    mergeable: pullRequest.mergeable,
    mergeableState: pullRequest.mergeable_state,
    unresolvedThreadCount: fetchUnresolvedThreadCount(repository, number),
    latestReviewStates: latestReviewStates(reviews),
    noemaReviewDecision: parseNoemaReviewDecision(reviews, headSha),
    checkRuns: fetchCheckRuns(repository, headSha),
    statuses: fetchStatuses(repository, headSha),
    title: bounded(pullRequest.title, 300),
  };
}

function revalidateLivePullRequest(repository, number, expectedHeadSha, { requireClean }) {
  const live = fetchPullRequest(repository, number);
  if (live.state !== "open") {
    throw new Error(`Pull request #${number} is no longer open.`);
  }
  if (live.head.sha !== expectedHeadSha) {
    throw new Error(`Pull request #${number} head moved from ${expectedHeadSha} to ${bounded(live.head.sha, 80)}.`);
  }
  if (live.head.repo.full_name !== repository) {
    throw new Error(`Pull request #${number} no longer has a same-repository head.`);
  }
  if (live.base.ref !== "main" || live.base.repo.full_name !== repository) {
    throw new Error(`Pull request #${number} no longer targets this repository's main branch.`);
  }
  if (live.draft !== false) {
    throw new Error(`Pull request #${number} became draft before the write.`);
  }
  if (live.mergeable !== true) {
    throw new Error(`Pull request #${number} is not confirmed mergeable before the write.`);
  }
  if (requireClean && live.mergeable_state !== "clean") {
    throw new Error(`Pull request #${number} mergeable_state is ${bounded(live.mergeable_state, 80)}, not clean.`);
  }
  return live;
}

function dispatchNoemaReview(repository, number, expectedHeadSha) {
  revalidateLivePullRequest(repository, number, expectedHeadSha, { requireClean: false });
  const payload = {
    event_type: "noema-review",
    client_payload: {
      target_repository: repository,
      pr_number: number,
      pr_head_sha: expectedHeadSha,
    },
  };
  runGh(["api", "-X", "POST", `repos/${repository}/dispatches`, "--input", "-"], {
    input: JSON.stringify(payload),
  });
}

function mergePullRequest(repository, number, expectedHeadSha) {
  revalidateLivePullRequest(repository, number, expectedHeadSha, { requireClean: true });
  const payload = {
    merge_method: "squash",
    sha: expectedHeadSha,
  };
  const response = runGhJson(
    ["api", "-X", "PUT", `repos/${repository}/pulls/${number}/merge`, "--input", "-"],
    { input: JSON.stringify(payload) },
  );
  if (response.merged !== true) {
    throw new Error(`GitHub refused to merge pull request #${number}: ${bounded(response.message, MAX_ERROR_CHARS)}`);
  }
  return bounded(response.sha, 80);
}

function parseArguments(argv) {
  const options = {
    apply: false,
    repository: process.env.GITHUB_REPOSITORY ?? "",
    reportPath: resolve("artifacts/commercial-readiness-loop/report.json"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--repository") {
      options.repository = argv[index + 1] ?? "";
      index += 1;
    } else if (argument === "--report") {
      options.reportPath = resolve(argv[index + 1] ?? "");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!repositoryPattern.test(options.repository)) {
    throw new Error("Hourly readiness requires a ContextualWisdomLab owner/name repository.");
  }
  return options;
}

function writeReport(reportPath, report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function appendWorkflowOutputs(reportPath, openPullRequestCount) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  appendFileSync(
    outputPath,
    `open_pull_request_count=${openPullRequestCount}\nreport_path=${reportPath}\n`,
    "utf8",
  );
}

function summaryText(value) {
  return bounded(value, 500).replace(/[\r\n|]+/g, " ").trim();
}

function appendWorkflowSummary(report) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    "## Hourly commercial-readiness loop",
    "",
    `- Repository: \`${summaryText(report.repository)}\``,
    `- Apply mode: \`${report.apply}\``,
    `- Open pull requests inspected: \`${report.openPullRequestCount}\``,
    "",
  ];
  if (report.results.length > 0) {
    lines.push("| PR | Decision | Write | Reasons |", "|---:|---|---|---|");
    for (const result of report.results) {
      lines.push(
        `| #${result.number} | ${summaryText(result.action)} | ${summaryText(result.write || "none")} | ${summaryText(result.reasons.map((reason) => reason.code).join(", ") || "none")} |`,
      );
    }
  } else {
    lines.push("No open pull request exists; the workflow can run report-only readiness audits.");
  }
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const report = {
    schemaVersion: 1,
    repository: options.repository,
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    openPullRequestCount: 0,
    results: [],
  };
  try {
    const openPullRequests = fetchOpenPullRequests(options.repository)
      .sort((left, right) => Number(left.number) - Number(right.number));
    report.openPullRequestCount = openPullRequests.length;

    for (const item of openPullRequests) {
      const number = Number(item.number);
      if (!Number.isInteger(number) || number <= 0) {
        throw new Error("GitHub returned an invalid open pull-request number.");
      }
      const snapshot = buildSnapshot(options.repository, number);
      const decision = evaluatePullRequest(snapshot);
      const result = {
        number,
        title: snapshot.title,
        headSha: snapshot.headSha,
        action: decision.action,
        reasons: decision.reasons.map((reason) => ({
          code: bounded(reason.code, 100),
          detail: bounded(reason.detail),
        })),
        write: options.apply ? "none" : "dry_run",
      };

      if (options.apply && decision.action === "request_review") {
        dispatchNoemaReview(options.repository, number, snapshot.headSha);
        result.write = "noema_review_dispatched";
      } else if (options.apply && decision.action === "merge") {
        result.mergeSha = mergePullRequest(options.repository, number, snapshot.headSha);
        result.write = "merged";
      }
      report.results.push(result);
    }

    writeReport(options.reportPath, report);
    appendWorkflowOutputs(options.reportPath, report.openPullRequestCount);
    appendWorkflowSummary(report);
    return report;
  } catch (error) {
    report.error = bounded(error instanceof Error ? error.message : error, MAX_ERROR_CHARS);
    writeReport(options.reportPath, report);
    appendWorkflowOutputs(options.reportPath, report.openPullRequestCount);
    appendWorkflowSummary(report);
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`hourly commercial-readiness loop failed: ${bounded(error instanceof Error ? error.message : error, MAX_ERROR_CHARS)}`);
    process.exitCode = 1;
  }
}
