export const DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS = 5 * 60 * 1000;
export const MAX_RUNNER_QUEUE_GRACE_MILLISECONDS = 30 * 60 * 1000;
const canonicalShaPattern = /^[0-9a-f]{40}$/;
const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;
const pendingJobStatuses = new Set(["queued", "requested", "waiting", "pending"]);

function failure(code, detail, context = {}) {
  return { code, detail, ...context };
}

function check(code, pass, detail, context = {}) {
  return { code, pass, detail, ...context };
}

function parseTimestamp(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 100
    || !canonicalUtcTimestampPattern.test(value)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return null;
  }
  const canonical = new Date(milliseconds).toISOString();
  const expected = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  return canonical === expected ? milliseconds : null;
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function boundedName(value) {
  if (typeof value !== "string") {
    return "unknown";
  }
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.length === 0 ? "unknown" : text.slice(0, 300);
}

function assignmentObserved(job) {
  const runnerId = job?.runner_id;
  const runnerName = typeof job?.runner_name === "string"
    ? job.runner_name.replace(/[\u0000-\u001f\u007f]/g, "").trim()
    : "";
  return positiveSafeInteger(runnerId) || runnerName.length > 0;
}

function invalidEvidence(detail) {
  return {
    status: "FAIL",
    checks: [],
    failures: [failure("runner_evidence_invalid", detail)],
  };
}

/**
 * Evaluate bounded GitHub Actions runner-assignment evidence.
 *
 * The evaluator answers only whether each selected pull-request workflow job
 * obtained a runner. A later test, security, or workflow conclusion remains a
 * separate evidence class. GitHub may populate `started_at` while a queued job
 * still has runner_id=0 and no runner_name, so timestamps are not assignment
 * authority. Every retained job must carry the same positive `run_attempt` as
 * its parent run; predecessor-attempt runner identity cannot satisfy or alter
 * current-attempt assignment evidence. Freshly queued jobs remain non-passing
 * `PENDING`. A grace-window stall is emitted only when both the workflow run and
 * the job remain queued with no runner identity observed anywhere in the selected
 * current attempt; protection/dependency waits stay non-passing without being
 * mislabeled as a runner-allocation failure.
 *
 * @param {unknown} evidence Untrusted workflow-run and job evidence.
 * @returns {{status: "PASS" | "PENDING" | "FAIL", checks: object[], failures: object[]}}
 *   A deterministic assignment decision that never substitutes for a required
 *   GitHub Check, review, merge, release, or deployment authority.
 */
export function evaluateRunnerAssignmentEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || !Array.isArray(evidence.runs)) {
    return invalidEvidence("Runner-assignment evidence must contain a runs array.");
  }

  const expectedHeadSha = evidence.expected_head_sha;
  if (typeof expectedHeadSha !== "string" || !canonicalShaPattern.test(expectedHeadSha)) {
    return invalidEvidence("expected_head_sha must be a canonical 40-character lowercase commit SHA.");
  }

  const observedAt = parseTimestamp(evidence.observed_at);
  if (observedAt === null || observedAt > Date.now()) {
    return invalidEvidence("observed_at must be a parseable non-future timestamp.");
  }

  const queueGrace = evidence.queue_grace_milliseconds
    ?? DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS;
  if (
    !Number.isSafeInteger(queueGrace)
    || queueGrace <= 0
    || queueGrace > MAX_RUNNER_QUEUE_GRACE_MILLISECONDS
  ) {
    return invalidEvidence(
      `queue_grace_milliseconds must be an integer between 1 and ${MAX_RUNNER_QUEUE_GRACE_MILLISECONDS}.`,
    );
  }

  if (evidence.runs.length === 0) {
    return {
      status: "FAIL",
      checks: [],
      failures: [
        failure(
          "workflow_run_evidence_missing",
          "At least one current-head workflow run is required for runner-assignment evidence.",
        ),
      ],
    };
  }

  const checks = [];
  const failures = [];
  let pending = false;

  for (const run of evidence.runs) {
    if (!run || typeof run !== "object" || !positiveSafeInteger(run.id)) {
      failures.push(
        failure("workflow_run_invalid", "Each workflow run must include a positive integer id."),
      );
      continue;
    }

    const runContext = {
      run_id: run.id,
      run_attempt: run.run_attempt,
      workflow_name: boundedName(run.name),
    };

    if (!positiveSafeInteger(run.run_attempt)) {
      failures.push(
        failure(
          "workflow_run_attempt_invalid",
          "Each workflow run must include a positive integer run_attempt.",
          runContext,
        ),
      );
      continue;
    }

    if (run.head_sha !== expectedHeadSha) {
      failures.push(
        failure(
          "workflow_run_head_mismatch",
          "Workflow-run evidence is not bound to the expected pull-request source head.",
          runContext,
        ),
      );
      continue;
    }

    if (run.event !== "pull_request") {
      failures.push(
        failure(
          "workflow_run_event_invalid",
          "Runner-assignment evidence must come from a pull_request workflow run.",
          runContext,
        ),
      );
      continue;
    }

    const createdAt = parseTimestamp(run.created_at);
    if (createdAt === null || createdAt > observedAt) {
      failures.push(
        failure(
          "workflow_run_timestamp_invalid",
          "Workflow-run created_at must be a parseable timestamp no later than observed_at.",
          runContext,
        ),
      );
      continue;
    }

    if (!Array.isArray(run.jobs) || run.jobs.length === 0) {
      failures.push(
        failure(
          "workflow_job_evidence_missing",
          "Each selected workflow run must include at least one job record.",
          runContext,
        ),
      );
      continue;
    }

    const runStatus = boundedName(run.status).toLowerCase();
    const runHasAssignment = run.jobs.some((job) => (
      positiveSafeInteger(job?.run_attempt)
      && job.run_attempt === run.run_attempt
      && assignmentObserved(job)
    ));

    for (const job of run.jobs) {
      if (!job || typeof job !== "object" || !positiveSafeInteger(job.id)) {
        failures.push(
          failure(
            "workflow_job_invalid",
            "Each workflow job must include a positive integer id.",
            runContext,
          ),
        );
        continue;
      }

      const jobContext = {
        ...runContext,
        job_id: job.id,
        job_name: boundedName(job.name),
      };

      if (!positiveSafeInteger(job.run_attempt)) {
        failures.push(
          failure(
            "workflow_job_attempt_invalid",
            "Each workflow job must include a positive integer run_attempt.",
            { ...jobContext, job_run_attempt: job.run_attempt },
          ),
        );
        continue;
      }

      if (job.run_attempt !== run.run_attempt) {
        failures.push(
          failure(
            "workflow_job_attempt_mismatch",
            "Workflow-job evidence does not belong to the selected workflow-run attempt.",
            { ...jobContext, job_run_attempt: job.run_attempt },
          ),
        );
        continue;
      }

      if (assignmentObserved(job)) {
        checks.push(
          check(
            "runner_assignment_observed",
            true,
            "GitHub job evidence contains a positive runner id or non-empty runner name; the later job conclusion remains separate.",
            jobContext,
          ),
        );
        continue;
      }

      const jobStatus = boundedName(job.status).toLowerCase();
      if (!pendingJobStatuses.has(jobStatus)) {
        failures.push(
          failure(
            "runner_assignment_not_observed",
            "The job reached a non-queue state without trustworthy runner identity evidence.",
            { ...jobContext, job_status: jobStatus },
          ),
        );
        continue;
      }

      const runnerQueueIsIsolated = jobStatus === "queued"
        && runStatus === "queued"
        && !runHasAssignment;

      if (!runnerQueueIsIsolated) {
        pending = true;
        checks.push(
          check(
            "runner_assignment_pending",
            false,
            "The job is non-passing, but current evidence does not isolate runner allocation from dependency or protection-rule waiting.",
            { ...jobContext, job_status: jobStatus, run_status: runStatus },
          ),
        );
        continue;
      }

      const queuedMilliseconds = observedAt - createdAt;
      if (queuedMilliseconds > queueGrace) {
        failures.push(
          failure(
            "runner_assignment_stalled",
            "The current-head run and job remained queued without runner-assignment evidence beyond the bounded grace window.",
            { ...jobContext, queued_milliseconds: queuedMilliseconds },
          ),
        );
        checks.push(
          check(
            "runner_assignment_stalled",
            false,
            "Runner assignment was not observed before the bounded queue grace elapsed after the queue boundary was isolated.",
            { ...jobContext, queued_milliseconds: queuedMilliseconds },
          ),
        );
        continue;
      }

      pending = true;
      checks.push(
        check(
          "runner_assignment_pending",
          false,
          "The current-head run and job remain queued inside the bounded runner-assignment grace and are not passing evidence.",
          { ...jobContext, queued_milliseconds: queuedMilliseconds },
        ),
      );
    }
  }

  return {
    status: failures.length > 0 ? "FAIL" : pending ? "PENDING" : "PASS",
    checks,
    failures,
  };
}
