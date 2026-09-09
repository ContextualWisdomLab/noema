import { describe, expect, it } from "vitest";
import {
  evaluateExternalExtensionLifecycleOperabilityEvidence as evaluate,
  nearestRankPercentile,
} from "../scripts/lib/external-extension-lifecycle-operability-evidence.mjs";

const latency = (value: number, count = 100): number[] => Array.from({ length: count }, () => value);

function evidence() {
  return {
    schema_version: 1,
    source_kind: "cloudflare_durable_object_remote",
    repository_full_name: "ContextualWisdomLab/noema",
    protected_main_sha: "a".repeat(40),
    deployed_worker_sha: "a".repeat(40),
    observed_at: "2026-09-10T00:30:00.000Z",
    binding_name: "NOEMA_EXTERNAL_EXTENSION_LIFECYCLE",
    storage_backend: "sqlite",
    read_current: {
      planned_samples: 100,
      latency_ms: latency(5),
      failure_count: 0,
      warmup_excluded_count: 0,
    },
    contended_append: {
      planned_samples: 100,
      latency_ms: latency(8),
      failure_count: 0,
      warmup_excluded_count: 0,
      contention_trials: 50,
      accepted_winners: 50,
      conflict_losers: 50,
    },
    recovery: {
      retained_event_count: 129,
      complete_audit_rebuild_verified: true,
      restart_recovery_verified: true,
      rollback_recovery_verified: true,
      malformed_head_rejected: true,
      truncated_audit_rejected: true,
    },
    storage: {
      bytes_before: 100,
      bytes_after: 200,
    },
  };
}

function codes(result: ReturnType<typeof evaluate>) {
  return result.failures.map((failure) => failure.code);
}

describe("external-extension lifecycle operability evidence edge coverage", () => {
  it("rejects every invalid nearest-rank input class", () => {
    const invalidCalls = [
      () => nearestRankPercentile(null as unknown as number[], 0.95),
      () => nearestRankPercentile([], 0.95),
      () => nearestRankPercentile([1], "0.95" as unknown as number),
      () => nearestRankPercentile([1], Number.NaN),
      () => nearestRankPercentile([1], 0),
      () => nearestRankPercentile([1], 1.01),
      () => nearestRankPercentile([Number.NaN], 0.95),
      () => nearestRankPercentile([-1], 0.95),
    ];
    for (const call of invalidCalls) expect(call).toThrow(TypeError);
  });

  it("rejects non-object evidence before field access", () => {
    for (const candidate of [null, [], "evidence", 1]) {
      const result = evaluate(candidate);
      expect(result.status).toBe("FAIL");
      expect(codes(result)).toEqual(["evidence_shape"]);
    }
  });

  it("covers each source-identity short-circuit", () => {
    const mutations: Array<(value: ReturnType<typeof evidence>) => void> = [
      (value) => { value.repository_full_name = "Other/noema"; },
      (value) => { value.protected_main_sha = 1 as unknown as string; },
      (value) => { value.protected_main_sha = "g".repeat(40); },
      (value) => { value.deployed_worker_sha = 1 as unknown as string; },
      (value) => { value.deployed_worker_sha = "g".repeat(40); },
      (value) => { value.deployed_worker_sha = "b".repeat(40); },
      (value) => { value.binding_name = "OTHER_BINDING"; },
    ];
    for (const mutate of mutations) {
      const candidate = evidence();
      mutate(candidate);
      expect(codes(evaluate(candidate))).toContain("source_identity");
    }
  });

  it("rejects non-canonical and impossible UTC instants", () => {
    for (const observedAt of [
      1 as unknown as string,
      "2026-09-10T00:30:00Z",
      "2026-13-10T00:30:00.000Z",
      "2026-02-30T00:30:00.000Z",
    ]) {
      const candidate = evidence();
      candidate.observed_at = observedAt;
      expect(codes(evaluate(candidate))).toContain("observed_at");
    }
  });

  it("fails all read-current validation surfaces when the sample path is absent or malformed", () => {
    const candidates = [
      { ...evidence(), read_current: null as unknown as ReturnType<typeof evidence>["read_current"] },
      { ...evidence(), read_current: { ...evidence().read_current, latency_ms: latency(5, 99) } },
      { ...evidence(), read_current: { ...evidence().read_current, latency_ms: [...latency(5, 99), Number.NaN] } },
      { ...evidence(), read_current: { ...evidence().read_current, latency_ms: [...latency(5, 99), -1] } },
      { ...evidence(), read_current: { ...evidence().read_current, planned_samples: -1 } },
      { ...evidence(), read_current: { ...evidence().read_current, failure_count: -1 } },
      { ...evidence(), read_current: { ...evidence().read_current, warmup_excluded_count: -1 } },
    ];
    for (const candidate of candidates) {
      const resultCodes = codes(evaluate(candidate));
      expect(resultCodes).toEqual(expect.arrayContaining([
        "read_current_samples",
        "read_current_denominator",
        "read_current_failures",
        "read_current_p95",
      ]));
    }
  });

  it("distinguishes denominator drift, excluded warm-up, and request failure", () => {
    const denominator = evidence();
    denominator.read_current.planned_samples = 101;
    expect(codes(evaluate(denominator))).toContain("read_current_denominator");

    const warmup = evidence();
    warmup.read_current.warmup_excluded_count = 1;
    expect(codes(evaluate(warmup))).toContain("read_current_denominator");

    const failed = evidence();
    failed.read_current.failure_count = 1;
    failed.read_current.planned_samples = 101;
    expect(codes(evaluate(failed))).toContain("read_current_failures");
  });

  it("fails all contended-append validation surfaces when its sample path is absent or malformed", () => {
    const candidates = [
      { ...evidence(), contended_append: null as unknown as ReturnType<typeof evidence>["contended_append"] },
      { ...evidence(), contended_append: { ...evidence().contended_append, latency_ms: latency(8, 99) } },
      { ...evidence(), contended_append: { ...evidence().contended_append, planned_samples: -1 } },
      { ...evidence(), contended_append: { ...evidence().contended_append, failure_count: -1 } },
      { ...evidence(), contended_append: { ...evidence().contended_append, warmup_excluded_count: -1 } },
    ];
    for (const candidate of candidates) {
      const resultCodes = codes(evaluate(candidate));
      expect(resultCodes).toEqual(expect.arrayContaining([
        "contended_append_samples",
        "contended_append_denominator",
        "contended_append_failures",
        "contended_append_p95",
        "contention_sample_denominator",
      ]));
    }
  });

  it("covers each contention-CAS short-circuit", () => {
    const mutations: Array<(value: ReturnType<typeof evidence>) => void> = [
      (value) => { value.contended_append.contention_trials = -1; },
      (value) => { value.contended_append.contention_trials = 0; },
      (value) => { value.contended_append.accepted_winners = -1; },
      (value) => { value.contended_append.conflict_losers = -1; },
      (value) => { value.contended_append.accepted_winners = 49; },
      (value) => { value.contended_append.conflict_losers = 49; },
    ];
    for (const mutate of mutations) {
      const candidate = evidence();
      mutate(candidate);
      expect(codes(evaluate(candidate))).toContain("contention_cas");
    }
  });

  it("fails closed when pairwise contention count cannot map safely to two measured attempts", () => {
    const candidate = evidence();
    candidate.contended_append.contention_trials = Number.MAX_SAFE_INTEGER;
    candidate.contended_append.accepted_winners = Number.MAX_SAFE_INTEGER;
    candidate.contended_append.conflict_losers = Number.MAX_SAFE_INTEGER;

    expect(codes(evaluate(candidate))).toContain("contention_sample_denominator");
  });

  it("covers audit-depth and recovery-rehearsal failures", () => {
    const badCount = evidence();
    badCount.recovery.retained_event_count = 128.5;
    expect(codes(evaluate(badCount))).toContain("audit_depth");

    const shortHistory = evidence();
    shortHistory.recovery.retained_event_count = 128;
    expect(codes(evaluate(shortHistory))).toContain("audit_depth");

    for (const field of [
      "complete_audit_rebuild_verified",
      "restart_recovery_verified",
      "rollback_recovery_verified",
      "malformed_head_rejected",
      "truncated_audit_rejected",
    ] as const) {
      const candidate = evidence();
      candidate.recovery[field] = false;
      expect(codes(evaluate(candidate))).toContain("recovery_rehearsal");
    }

    const absent = evidence();
    absent.recovery = null as unknown as ReturnType<typeof evidence>["recovery"];
    expect(codes(evaluate(absent))).toEqual(expect.arrayContaining(["audit_depth", "recovery_rehearsal"]));
  });

  it("covers each storage-growth failure surface", () => {
    const mutations: Array<(value: ReturnType<typeof evidence>) => void> = [
      (value) => { value.storage = null as unknown as ReturnType<typeof evidence>["storage"]; },
      (value) => { value.storage.bytes_before = -1; },
      (value) => { value.storage.bytes_after = -1; },
      (value) => { value.storage.bytes_after = 99; },
    ];
    for (const mutate of mutations) {
      const candidate = evidence();
      mutate(candidate);
      const result = evaluate(candidate);
      expect(codes(result)).toContain("storage_growth");
      expect(result.metrics.storage_growth_bytes).toBeNull();
    }
  });

  it("reports schema, source-kind, storage-backend, and p95 failures independently", () => {
    const candidate = evidence();
    candidate.schema_version = 2;
    candidate.source_kind = "fixture";
    candidate.storage_backend = "kv";
    candidate.read_current.latency_ms = [...latency(1, 94), ...latency(21, 6)];
    candidate.contended_append.latency_ms = [...latency(1, 94), ...latency(22, 6)];
    candidate.contended_append.failure_count = 1;
    candidate.contended_append.planned_samples = 101;
    candidate.contended_append.warmup_excluded_count = 1;

    expect(codes(evaluate(candidate))).toEqual(expect.arrayContaining([
      "schema_version",
      "source_kind",
      "storage_backend",
      "read_current_p95",
      "contended_append_denominator",
      "contended_append_failures",
      "contended_append_p95",
      "contention_sample_denominator",
    ]));
  });
});
