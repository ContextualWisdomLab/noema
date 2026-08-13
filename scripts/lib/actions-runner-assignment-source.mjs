const MAX_SELECTED_RUNS = 20;
const MAX_SELECTED_JOBS = 2000;
const MAX_RUN_ID_TEXT_BYTES = 1000;

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Parse a bounded comma-separated GitHub Actions run-id selection.
 *
 * @param {unknown} value Operator-supplied comma-separated numeric run IDs.
 * @returns {number[]} Unique positive run IDs in the supplied order.
 */
export function parseSelectedRunIds(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Select at least one GitHub Actions run id.");
  }
  if (Buffer.byteLength(value, "utf8") > MAX_RUN_ID_TEXT_BYTES) {
    throw new Error(`Run-id selection must be at most ${MAX_RUN_ID_TEXT_BYTES} bytes.`);
  }

  const tokens = value.split(",").map((token) => token.trim());
  if (tokens.length > MAX_SELECTED_RUNS) {
    throw new Error(`Select at most ${MAX_SELECTED_RUNS} workflow runs per audit.`);
  }

  const runIds = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!/^[1-9][0-9]*$/.test(token)) {
      throw new Error("Every selected GitHub Actions run id must be a positive integer.");
    }
    const runId = Number(token);
    if (!positiveSafeInteger(runId)) {
      throw new Error("Every selected GitHub Actions run id must be a positive integer.");
    }
    if (seen.has(runId)) {
      throw new Error("Selected GitHub Actions run ids must be unique.");
    }
    seen.add(runId);
    runIds.push(runId);
  }

  return runIds;
}

/**
 * Flatten paginated GitHub Actions job pages without trusting page shape.
 *
 * @param {unknown} pages Slurped `gh api --paginate` page objects.
 * @returns {object[]} A bounded list containing every job from every page.
 */
export function flattenJobPages(pages) {
  if (!Array.isArray(pages)) {
    throw new Error("Workflow job pages must be supplied as an array.");
  }

  const jobs = [];
  for (const page of pages) {
    if (!page || typeof page !== "object" || !Array.isArray(page.jobs)) {
      throw new Error("Each workflow job page must contain a jobs array.");
    }
    if (jobs.length + page.jobs.length > MAX_SELECTED_JOBS) {
      throw new Error(`Workflow job evidence exceeds the ${MAX_SELECTED_JOBS}-job bound.`);
    }
    jobs.push(...page.jobs);
  }
  return jobs;
}

function projectRun(run) {
  if (!run || typeof run !== "object") {
    throw new Error("GitHub workflow-run evidence must be an object.");
  }
  return {
    id: run.id,
    name: run.name,
    event: run.event,
    head_sha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
  };
}

function projectJob(job) {
  if (!job || typeof job !== "object") {
    throw new Error("GitHub workflow-job evidence must be an object.");
  }
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    started_at: job.started_at,
    completed_at: job.completed_at,
    runner_id: job.runner_id,
    runner_name: job.runner_name,
  };
}

/**
 * Collect exact-head workflow-run/job evidence through injected read-only adapters.
 *
 * Network transport is deliberately outside this function. Callers provide one
 * read adapter for a workflow run and one for its fully paginated job pages;
 * only the bounded fields consumed by runner-assignment evaluation are retained.
 *
 * @param {object} input Source identity, selected runs, and read adapters.
 * @returns {Promise<object>} Evidence ready for deterministic assignment evaluation.
 */
export async function collectRunnerAssignmentEvidence(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Runner-assignment source input must be an object.");
  }
  if (!Array.isArray(input.run_ids) || input.run_ids.length === 0) {
    throw new Error("At least one selected workflow run is required.");
  }
  if (input.run_ids.length > MAX_SELECTED_RUNS) {
    throw new Error(`Select at most ${MAX_SELECTED_RUNS} workflow runs per audit.`);
  }
  if (!input.run_ids.every(positiveSafeInteger) || new Set(input.run_ids).size !== input.run_ids.length) {
    throw new Error("Selected workflow run ids must be unique positive integers.");
  }
  if (typeof input.fetch_run !== "function" || typeof input.fetch_job_pages !== "function") {
    throw new Error("Read-only workflow-run and job-page adapters are required.");
  }

  const runs = [];
  let selectedJobCount = 0;
  for (const runId of input.run_ids) {
    const run = projectRun(await input.fetch_run(runId));
    const jobPages = await input.fetch_job_pages(runId);
    const jobs = flattenJobPages(jobPages).map(projectJob);
    if (selectedJobCount + jobs.length > MAX_SELECTED_JOBS) {
      throw new Error(`Workflow job evidence exceeds the ${MAX_SELECTED_JOBS}-job bound.`);
    }
    selectedJobCount += jobs.length;
    runs.push({ ...run, jobs });
  }

  return {
    expected_head_sha: input.expected_head_sha,
    observed_at: input.observed_at,
    queue_grace_milliseconds: input.queue_grace_milliseconds,
    runs,
  };
}

export { MAX_SELECTED_RUNS };