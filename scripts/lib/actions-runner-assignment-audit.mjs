export const DEFAULT_RUNNER_QUEUE_GRACE_MILLISECONDS = 5 * 60 * 1000;
export const MAX_RUNNER_QUEUE_GRACE_MILLISECONDS = 30 * 60 * 1000;
const canonicalShaPattern = /^[0-9a-f]{40}$/;
const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;
const pendingJobStatuses = new Set(["queued", "requested", "waiting", "pending"]);
const invisibleNamePattern = /[\p{Cc}\p{Cf}]/u;

function assignmentFailure(failureCode, failureDetail, failureContext = {}) {
  return { failure_code: failureCode, failure_detail: failureDetail, ...failureContext };
}

function assignmentCheck(checkCode, checkPassed, checkDetail, checkContext = {}) {
  return {
    check_code: checkCode,
    check_passed: checkPassed,
    check_detail: checkDetail,
    ...checkContext,
  };
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

function visibleName(value) {
  if (typeof value !== "string" || invisibleNamePattern.test(value)) return "";
  return value.trim();
}

function boundedName(value) {
  const text = visibleName(value);
  return text.length === 0 ? "unknown" : text.slice(0, 300);
}

function assignmentObserved(workflowJob) {
  const runnerId = workflowJob?.runner_id;
  const runnerName = visibleName(workflowJob?.runner_name);
  return positiveSafeInteger(runnerId) || runnerName.length > 0;
}

function invalidEvidence(failureDetail) {
  return {
    audit_status: "FAIL",
    assignment_checks: [],
    assignment_failures: [assignmentFailure("runner_evidence_invalid", failureDetail)],
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
 * its parent workflow run; predecessor-attempt runner identity cannot satisfy or
 * alter current-attempt assignment evidence. Freshly queued jobs remain
 * non-passing `PENDING`. A grace-window stall is emitted only when both the
 * workflow run and workflow job remain queued with no runner identity observed
 * anywhere in the selected current attempt; protection/dependency waits stay
 * non-passing without being mislabeled as a runner-allocation failure.
 *
 * The input is a ContextualWisdomLab-owned evidence contract. GitHub's generic
 * REST names (`id`, `name`, `event`, `status`, `conclusion`, `jobs`) are accepted
 * only by the source adapter and are translated before this evaluator is called.
 *
 * @param {unknown} evidence Semantic workflow-run and workflow-job evidence.
 * @returns {{audit_status: "PASS" | "PENDING" | "FAIL", assignment_checks: object[], assignment_failures: object[]}}
 *   A deterministic assignment decision that never substitutes for a required
 *   GitHub Check, review, merge, release, or deployment authority.
 */
export function evaluateRunnerAssignmentEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || !Array.isArray(evidence.workflow_runs)) {
    return invalidEvidence("Runner-assignment evidence must contain a workflow_runs array.");
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

  if (evidence.workflow_runs.length === 0) {
    return {
      audit_status: "FAIL",
      assignment_checks: [],
      assignment_failures: [
        assignmentFailure(
          "workflow_run_evidence_missing",
          "At least one current-head workflow run is required for runner-assignment evidence.",
        ),
      ],
    };
  }

  const assignmentChecks = [];
  const assignmentFailures = [];
  let auditPending = false;

  for (const workflowRun of evidence.workflow_runs) {
    if (
      !workflowRun
      || typeof workflowRun !== "object"
      || !positiveSafeInteger(workflowRun.workflow_run_id)
    ) {
      assignmentFailures.push(
        assignmentFailure(
          "workflow_run_invalid",
          "Each workflow run must include a positive integer workflow_run_id.",
        ),
      );
      continue;
    }

    const runContext = {
      workflow_run_id: workflowRun.workflow_run_id,
      run_attempt: workflowRun.run_attempt,
      workflow_name: boundedName(workflowRun.workflow_name),
    };

    if (!positiveSafeInteger(workflowRun.run_attempt)) {
      assignmentFailures.push(
        assignmentFailure(
          "workflow_run_attempt_invalid",
          "Each workflow run must include a positive integer run_attempt.",
          runContext,
        ),
      );
      continue;
    }

    if (workflowRun.head_sha !== expectedHeadSha) {
      assignmentFailures.push(
        assignmentFailure(
          "workflow_run_head_mismatch",
          "Workflow-run evidence is not bound to the expected pull-request source head.",
          runContext,
        ),
      );
      continue;
    }

    if (workflowRun.trigger_event !== "pull_request") {
      assignmentFailures.push(
        assignmentFailure(
          "workflow_run_event_invalid",
          "Runner-assignment evidence must come from a pull_request workflow run.",
          runContext,
        ),
      );
      continue;
    }

    const createdAt = parseTimestamp(workflowRun.created_at);
    if (createdAt === null || createdAt > observedAt) {
      assignmentFailures.push(
        assignmentFailure(
          "workflow_run_timestamp_invalid",
          "Workflow-run created_at must be a parseable timestamp no later than observed_at.",
          runContext,
        ),
      );
      continue;
    }

    if (!Array.isArray(workflowRun.workflow_jobs) || workflowRun.workflow_jobs.length === 0) {
      assignmentFailures.push(
        assignmentFailure(
          "workflow_job_evidence_missing",
          "Each selected workflow run must include at least one workflow_jobs record.",
          runContext,
        ),
      );
      continue;
    }

    const runStatus = boundedName(workflowRun.workflow_run_status).toLowerCase();
    const runHasAssignment = workflowRun.workflow_jobs.some((workflowJob) => (
      positiveSafeInteger(workflowJob?.run_attempt)
      && workflowJob.run_attempt === workflowRun.run_attempt
      && assignmentObserved(workflowJob)
    ));

    for (const workflowJob of workflowRun.workflow_jobs) {
      if (
        !workflowJob
        || typeof workflowJob !== "object"
        || !positiveSafeInteger(workflowJob.workflow_job_id)
      ) {
        assignmentFailures.push(
          assignmentFailure(
            "workflow_job_invalid",
            "Each workflow job must include a positive integer workflow_job_id.",
            runContext,
          ),
        );
        continue;
      }

      const jobContext = {
        ...runContext,
        workflow_job_id: workflowJob.workflow_job_id,
        workflow_job_name: boundedName(workflowJob.workflow_job_name),
      };

      if (!positiveSafeInteger(workflowJob.run_attempt)) {
        assignmentFailures.push(
          assignmentFailure(
            "workflow_job_attempt_invalid",
            "Each workflow job must include a positive integer run_attempt.",
            { ...jobContext, job_run_attempt: workflowJob.run_attempt },
          ),
        );
        continue;
      }

      if (workflowJob.run_attempt !== workflowRun.run_attempt) {
        assignmentFailures.push(
          assignmentFailure(
            "workflow_job_attempt_mismatch",
            "Workflow-job evidence does not belong to the selected workflow-run attempt.",
            { ...jobContext, job_run_attempt: workflowJob.run_attempt },
          ),
        );
        continue;
      }

      if (assignmentObserved(workflowJob)) {
        assignmentChecks.push(
          assignmentCheck(
            "runner_assignment_observed",
            true,
            "GitHub job evidence contains a positive runner id or non-empty visible runner name; the later job conclusion remains separate.",
            jobContext,
          ),
        );
        continue;
      }

      const jobStatus = boundedName(workflowJob.workflow_job_status).toLowerCase();
      if (!pendingJobStatuses.has(jobStatus)) {
        assignmentFailures.push(
          assignmentFailure(
            "runner_assignment_not_observed",
            "The workflow job reached a non-queue state without trustworthy runner identity evidence.",
            { ...jobContext, workflow_job_status: jobStatus },
          ),
        );
        continue;
      }

      const runnerQueueIsIsolated = jobStatus === "queued"
        && runStatus === "queued"
        && !runHasAssignment;

      if (!runnerQueueIsIsolated) {
        auditPending = true;
        assignmentChecks.push(
          assignmentCheck(
            "runner_assignment_pending",
            false,
            "The workflow job is non-passing, but current evidence does not isolate runner allocation from dependency or protection-rule waiting.",
            {
              ...jobContext,
              workflow_job_status: jobStatus,
              workflow_run_status: runStatus,
            },
          ),
        );
        continue;
      }

      const queuedMilliseconds = observedAt - createdAt;
      if (queuedMilliseconds > queueGrace) {
        assignmentFailures.push(
          assignmentFailure(
            "runner_assignment_stalled",
            "The current-head workflow run and job remained queued without runner-assignment evidence beyond the bounded grace window.",
            { ...jobContext, queued_milliseconds: queuedMilliseconds },
          ),
        );
        assignmentChecks.push(
          assignmentCheck(
            "runner_assignment_stalled",
            false,
            "Runner assignment was not observed before the bounded queue grace elapsed after the queue boundary was isolated.",
            { ...jobContext, queued_milliseconds: queuedMilliseconds },
          ),
        );
        continue;
      }

      auditPending = true;
      assignmentChecks.push(
        assignmentCheck(
          "runner_assignment_pending",
          false,
          "The current-head workflow run and job remain queued inside the bounded runner-assignment grace and are not passing evidence.",
          { ...jobContext, queued_milliseconds: queuedMilliseconds },
        ),
      );
    }
  }

  return {
    audit_status: assignmentFailures.length > 0 ? "FAIL" : auditPending ? "PENDING" : "PASS",
    assignment_checks: assignmentChecks,
    assignment_failures: assignmentFailures,
  };
}
