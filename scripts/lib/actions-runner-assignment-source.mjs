const MAX_SELECTED_RUNS = 20;
const MAX_SELECTED_JOBS = 2000;
const MAX_RUN_ID_TEXT_BYTES = 1000;

function positiveSafeInteger(integerCandidate) {
  return Number.isSafeInteger(integerCandidate) && integerCandidate > 0;
}

/**
 * Parse a bounded comma-separated GitHub Actions run-id selection.
 *
 * @param {unknown} runIdText Operator-supplied comma-separated numeric run IDs.
 * @returns {number[]} Unique positive run IDs in the supplied order.
 */
export function parseSelectedRunIds(runIdText) {
  if (typeof runIdText !== "string" || runIdText.trim().length === 0) {
    throw new Error("Select at least one GitHub Actions run id.");
  }
  if (Buffer.byteLength(runIdText, "utf8") > MAX_RUN_ID_TEXT_BYTES) {
    throw new Error(`Run-id selection must be at most ${MAX_RUN_ID_TEXT_BYTES} bytes.`);
  }

  const runIdTokens = runIdText.split(",").map((runIdToken) => runIdToken.trim());
  if (runIdTokens.length > MAX_SELECTED_RUNS) {
    throw new Error(`Select at most ${MAX_SELECTED_RUNS} workflow runs per audit.`);
  }

  const runIds = [];
  const seenRunIds = new Set();
  for (const runIdToken of runIdTokens) {
    if (!/^[1-9][0-9]*$/.test(runIdToken)) {
      throw new Error("Every selected GitHub Actions run id must be a positive integer.");
    }
    const runId = Number(runIdToken);
    if (!positiveSafeInteger(runId)) {
      throw new Error("Every selected GitHub Actions run id must be a positive integer.");
    }
    if (seenRunIds.has(runId)) {
      throw new Error("Selected GitHub Actions run ids must be unique.");
    }
    seenRunIds.add(runId);
    runIds.push(runId);
  }

  return runIds;
}

/**
 * Flatten paginated GitHub Actions job pages without trusting page shape.
 *
 * GitHub owns the REST payload's `jobs` field. This helper is the adapter seam
 * that accepts that vendor shape before runner-assignment evidence is projected
 * into ContextualWisdomLab-owned semantic names.
 *
 * @param {unknown} jobPages Slurped `gh api --paginate` page objects.
 * @returns {object[]} A bounded list containing every GitHub workflow job payload.
 */
export function flattenJobPages(jobPages) {
  if (!Array.isArray(jobPages)) {
    throw new Error("Workflow job pages must be supplied as an array.");
  }

  const workflowJobPayloads = [];
  for (const jobPage of jobPages) {
    if (!jobPage || typeof jobPage !== "object" || !Array.isArray(jobPage.jobs)) {
      throw new Error("Each workflow job page must contain a jobs array.");
    }
    if (workflowJobPayloads.length + jobPage.jobs.length > MAX_SELECTED_JOBS) {
      throw new Error(`Workflow job evidence exceeds the ${MAX_SELECTED_JOBS}-job bound.`);
    }
    workflowJobPayloads.push(...jobPage.jobs);
  }
  return workflowJobPayloads;
}

function projectRun(workflowRunPayload) {
  if (!workflowRunPayload || typeof workflowRunPayload !== "object") {
    throw new Error("GitHub workflow-run evidence must be an object.");
  }
  return {
    workflow_run_id: workflowRunPayload.id,
    workflow_name: workflowRunPayload.name,
    trigger_event: workflowRunPayload.event,
    head_sha: workflowRunPayload.head_sha,
    run_attempt: workflowRunPayload.run_attempt,
    workflow_run_status: workflowRunPayload.status,
    workflow_conclusion: workflowRunPayload.conclusion,
    created_at: workflowRunPayload.created_at,
  };
}

function projectJob(workflowJobPayload) {
  if (!workflowJobPayload || typeof workflowJobPayload !== "object") {
    throw new Error("GitHub workflow-job evidence must be an object.");
  }
  return {
    workflow_job_id: workflowJobPayload.id,
    workflow_job_name: workflowJobPayload.name,
    run_attempt: workflowJobPayload.run_attempt,
    workflow_job_status: workflowJobPayload.status,
    workflow_job_conclusion: workflowJobPayload.conclusion,
    started_at: workflowJobPayload.started_at,
    completed_at: workflowJobPayload.completed_at,
    runner_id: workflowJobPayload.runner_id,
    runner_name: workflowJobPayload.runner_name,
  };
}

/**
 * Collect exact-head workflow-run/job evidence through injected read-only adapters.
 *
 * Network transport is deliberately outside this function. Callers provide one
 * read adapter for a workflow run and one for its fully paginated job pages;
 * GitHub-owned generic REST fields are translated at this boundary into the
 * semantic runner-assignment evidence vocabulary consumed by Noema.
 * Re-run attempts require an attempt-aware job adapter. The production adapter
 * binds each job read to the validated `run_attempt`, and every returned job must
 * itself attest the same attempt before it is retained. After job collection the
 * run is fetched again and its run/head/attempt authority must still match the
 * initial snapshot, preventing a concurrently started rerun from promoting
 * predecessor-attempt runner identity. JavaScript function arity is not used as
 * an authority signal because default/rest parameters make `.length` non-semantic.
 *
 * @param {object} collectionRequest Source identity, selected runs, and read adapters.
 * @returns {Promise<object>} Evidence ready for deterministic assignment evaluation.
 */
export async function collectRunnerAssignmentEvidence(collectionRequest) {
  if (!collectionRequest || typeof collectionRequest !== "object") {
    throw new Error("Runner-assignment source input must be an object.");
  }
  if (!Array.isArray(collectionRequest.run_ids) || collectionRequest.run_ids.length === 0) {
    throw new Error("At least one selected workflow run is required.");
  }
  if (collectionRequest.run_ids.length > MAX_SELECTED_RUNS) {
    throw new Error(`Select at most ${MAX_SELECTED_RUNS} workflow runs per audit.`);
  }
  if (!collectionRequest.run_ids.every(positiveSafeInteger) || new Set(collectionRequest.run_ids).size !== collectionRequest.run_ids.length) {
    throw new Error("Selected workflow run ids must be unique positive integers.");
  }
  if (typeof collectionRequest.fetch_run !== "function" || typeof collectionRequest.fetch_job_pages !== "function") {
    throw new Error("Read-only workflow-run and job-page adapters are required.");
  }

  const workflowRuns = [];
  let selectedJobCount = 0;
  for (const runId of collectionRequest.run_ids) {
    const workflowRun = projectRun(await collectionRequest.fetch_run(runId));
    if (workflowRun.workflow_run_id !== runId) {
      throw new Error("Fetched workflow run id must equal the selected workflow run id.");
    }
    if (!positiveSafeInteger(workflowRun.run_attempt)) {
      throw new Error("Workflow run_attempt must be a positive integer.");
    }
    const initialRunAuthority = JSON.stringify([
      workflowRun.workflow_run_id,
      workflowRun.head_sha,
      workflowRun.run_attempt,
    ]);
    const jobPages = await collectionRequest.fetch_job_pages(runId, workflowRun.run_attempt);
    const workflowJobs = flattenJobPages(jobPages).map(projectJob);
    for (const workflowJob of workflowJobs) {
      if (!positiveSafeInteger(workflowJob.run_attempt)) {
        throw new Error("Workflow job run_attempt must be a positive integer.");
      }
      if (workflowJob.run_attempt !== workflowRun.run_attempt) {
        throw new Error("Workflow job run_attempt must equal the selected workflow run_attempt.");
      }
    }
    const currentWorkflowRun = projectRun(await collectionRequest.fetch_run(runId));
    const currentRunAuthority = JSON.stringify([
      currentWorkflowRun.workflow_run_id,
      currentWorkflowRun.head_sha,
      currentWorkflowRun.run_attempt,
    ]);
    if (currentRunAuthority !== initialRunAuthority) {
      throw new Error("Workflow run authority changed while collecting runner-assignment evidence.");
    }
    if (selectedJobCount + workflowJobs.length > MAX_SELECTED_JOBS) {
      throw new Error(`Workflow job evidence exceeds the ${MAX_SELECTED_JOBS}-job bound.`);
    }
    selectedJobCount += workflowJobs.length;
    workflowRuns.push({ ...currentWorkflowRun, workflow_jobs: workflowJobs });
  }

  return {
    expected_head_sha: collectionRequest.expected_head_sha,
    observed_at: collectionRequest.observed_at,
    queue_grace_milliseconds: collectionRequest.queue_grace_milliseconds,
    workflow_runs: workflowRuns,
  };
}

export { MAX_SELECTED_RUNS };
