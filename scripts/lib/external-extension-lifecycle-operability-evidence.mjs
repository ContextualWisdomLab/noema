const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REPOSITORY = "ContextualWisdomLab/noema";
const SOURCE_KIND = "cloudflare_durable_object_remote";
const BINDING_NAME = "NOEMA_EXTERNAL_EXTENSION_LIFECYCLE";
const STORAGE_BACKEND = "sqlite";
const MIN_LATENCY_SAMPLES = 100;
const BUYER_PATH_P95_MS = 20;
const MIN_AUDIT_EVENTS = 129;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function canonicalUtcInstant(value) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function latencySamples(value) {
  if (!Array.isArray(value) || value.length < MIN_LATENCY_SAMPLES) return null;
  if (value.some((sample) => typeof sample !== "number" || !Number.isFinite(sample) || sample < 0)) {
    return null;
  }
  return value;
}

/**
 * Compute a percentile using the deterministic nearest-rank definition.
 * The input is copied before sorting so evidence samples remain immutable to the evaluator.
 */
export function nearestRankPercentile(samples, percentile) {
  if (
    !Array.isArray(samples)
    || samples.length === 0
    || typeof percentile !== "number"
    || !Number.isFinite(percentile)
    || percentile <= 0
    || percentile > 1
    || samples.some((sample) => typeof sample !== "number" || !Number.isFinite(sample) || sample < 0)
  ) {
    throw new TypeError("percentile requires non-negative finite samples and percentile in (0, 1]");
  }
  const ordered = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil(percentile * ordered.length);
  return ordered[rank - 1];
}

function samplePath(value) {
  if (!isRecord(value)) return null;
  const samples = latencySamples(value.latency_ms);
  if (samples === null) return null;
  if (
    !nonNegativeSafeInteger(value.planned_samples)
    || !nonNegativeSafeInteger(value.failure_count)
    || !nonNegativeSafeInteger(value.warmup_excluded_count)
  ) {
    return null;
  }
  return {
    samples,
    plannedSamples: value.planned_samples,
    failureCount: value.failure_count,
    warmupExcludedCount: value.warmup_excluded_count,
  };
}

function addCheck(checks, failures, code, pass, detail) {
  checks.push({ code, pass });
  if (!pass) failures.push({ code, detail });
}

/**
 * Evaluate retained production evidence for the external-extension lifecycle Durable Object.
 *
 * The evaluator intentionally accepts only remote Cloudflare observations and recomputes p95
 * from the complete retained sample arrays. It validates evidence self-consistency; it does not
 * authenticate the evidence producer, deploy a Durable Object, or substitute for release/runtime
 * provenance from the owning deployment systems.
 */
export function evaluateExternalExtensionLifecycleOperabilityEvidence(evidence) {
  const checks = [];
  const failures = [];
  const metrics = {
    read_current_p95_ms: null,
    contended_append_p95_ms: null,
    storage_growth_bytes: null,
  };

  if (!isRecord(evidence)) {
    addCheck(checks, failures, "evidence_shape", false, "operability evidence must be an object");
    return { status: "FAIL", checks, failures, metrics };
  }

  addCheck(
    checks,
    failures,
    "schema_version",
    evidence.schema_version === 1,
    "schema_version must be 1",
  );
  addCheck(
    checks,
    failures,
    "source_kind",
    evidence.source_kind === SOURCE_KIND,
    "source_kind must identify a remote Cloudflare Durable Object observation",
  );

  const sourceIdentityValid = evidence.repository_full_name === REPOSITORY
    && typeof evidence.protected_main_sha === "string"
    && SHA.test(evidence.protected_main_sha)
    && typeof evidence.deployed_worker_sha === "string"
    && SHA.test(evidence.deployed_worker_sha)
    && evidence.deployed_worker_sha === evidence.protected_main_sha
    && evidence.binding_name === BINDING_NAME;
  addCheck(
    checks,
    failures,
    "source_identity",
    sourceIdentityValid,
    "repository, protected/deployed revision, and lifecycle binding must identify one exact Noema runtime",
  );
  addCheck(
    checks,
    failures,
    "observed_at",
    canonicalUtcInstant(evidence.observed_at),
    "observed_at must be a real canonical UTC instant with millisecond precision",
  );
  addCheck(
    checks,
    failures,
    "storage_backend",
    evidence.storage_backend === STORAGE_BACKEND,
    "new lifecycle Durable Object evidence must use the SQLite storage backend",
  );

  const readCurrent = samplePath(evidence.read_current);
  const readCurrentSamplesValid = readCurrent !== null;
  addCheck(
    checks,
    failures,
    "read_current_samples",
    readCurrentSamplesValid,
    `read_current must retain at least ${MIN_LATENCY_SAMPLES} non-negative finite latency samples and canonical counters`,
  );
  if (readCurrent !== null) {
    const denominatorValid = readCurrent.warmupExcludedCount === 0
      && readCurrent.plannedSamples === readCurrent.samples.length + readCurrent.failureCount;
    addCheck(
      checks,
      failures,
      "read_current_denominator",
      denominatorValid,
      "read_current planned denominator must equal retained samples plus failures and exclude no warm-up attempts",
    );
    addCheck(
      checks,
      failures,
      "read_current_failures",
      readCurrent.failureCount === 0,
      "read_current acceptance run must not hide failed requests from latency evidence",
    );
    metrics.read_current_p95_ms = nearestRankPercentile(readCurrent.samples, 0.95);
    addCheck(
      checks,
      failures,
      "read_current_p95",
      metrics.read_current_p95_ms <= BUYER_PATH_P95_MS,
      `read_current p95 must be <= ${BUYER_PATH_P95_MS} ms`,
    );
  } else {
    addCheck(checks, failures, "read_current_denominator", false, "read_current denominator cannot be verified");
    addCheck(checks, failures, "read_current_failures", false, "read_current failures cannot be verified");
    addCheck(checks, failures, "read_current_p95", false, "read_current p95 cannot be computed");
  }

  const contendedAppend = samplePath(evidence.contended_append);
  const contendedAppendSamplesValid = contendedAppend !== null;
  addCheck(
    checks,
    failures,
    "contended_append_samples",
    contendedAppendSamplesValid,
    `contended_append must retain at least ${MIN_LATENCY_SAMPLES} non-negative finite latency samples and canonical counters`,
  );
  if (contendedAppend !== null) {
    const denominatorValid = contendedAppend.warmupExcludedCount === 0
      && contendedAppend.plannedSamples === contendedAppend.samples.length + contendedAppend.failureCount;
    addCheck(
      checks,
      failures,
      "contended_append_denominator",
      denominatorValid,
      "contended_append planned denominator must equal retained samples plus failures and exclude no warm-up attempts",
    );
    addCheck(
      checks,
      failures,
      "contended_append_failures",
      contendedAppend.failureCount === 0,
      "contended_append acceptance run must not hide failed requests from latency evidence",
    );
    metrics.contended_append_p95_ms = nearestRankPercentile(contendedAppend.samples, 0.95);
    addCheck(
      checks,
      failures,
      "contended_append_p95",
      metrics.contended_append_p95_ms <= BUYER_PATH_P95_MS,
      `contended_append p95 must be <= ${BUYER_PATH_P95_MS} ms`,
    );
  } else {
    addCheck(checks, failures, "contended_append_denominator", false, "contended_append denominator cannot be verified");
    addCheck(checks, failures, "contended_append_failures", false, "contended_append failures cannot be verified");
    addCheck(checks, failures, "contended_append_p95", false, "contended_append p95 cannot be computed");
  }

  const contention = isRecord(evidence.contended_append)
    ? evidence.contended_append
    : {};
  const contentionCasValid = nonNegativeSafeInteger(contention.contention_trials)
    && contention.contention_trials > 0
    && nonNegativeSafeInteger(contention.accepted_winners)
    && nonNegativeSafeInteger(contention.conflict_losers)
    && contention.accepted_winners === contention.contention_trials
    && contention.conflict_losers === contention.contention_trials;
  addCheck(
    checks,
    failures,
    "contention_cas",
    contentionCasValid,
    "each pairwise contention trial must retain exactly one accepted winner and one conflict loser",
  );

  const recovery = isRecord(evidence.recovery) ? evidence.recovery : {};
  const auditDepthValid = Number.isSafeInteger(recovery.retained_event_count)
    && recovery.retained_event_count >= MIN_AUDIT_EVENTS;
  addCheck(
    checks,
    failures,
    "audit_depth",
    auditDepthValid,
    `recovery evidence must retain at least ${MIN_AUDIT_EVENTS} lifecycle events, beyond the workflow receipt ring size`,
  );
  const recoveryRehearsalValid = recovery.complete_audit_rebuild_verified === true
    && recovery.restart_recovery_verified === true
    && recovery.rollback_recovery_verified === true
    && recovery.malformed_head_rejected === true
    && recovery.truncated_audit_rejected === true;
  addCheck(
    checks,
    failures,
    "recovery_rehearsal",
    recoveryRehearsalValid,
    "complete audit rebuild, restart, rollback, malformed-head rejection, and truncated-audit rejection must all be verified",
  );

  const storage = isRecord(evidence.storage) ? evidence.storage : {};
  const storageGrowthValid = nonNegativeSafeInteger(storage.bytes_before)
    && nonNegativeSafeInteger(storage.bytes_after)
    && storage.bytes_after >= storage.bytes_before;
  if (storageGrowthValid) {
    metrics.storage_growth_bytes = storage.bytes_after - storage.bytes_before;
  }
  addCheck(
    checks,
    failures,
    "storage_growth",
    storageGrowthValid,
    "storage byte counters must be non-negative safe integers and cannot shrink during the retained-history acceptance run",
  );

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    checks,
    failures,
    metrics,
  };
}
