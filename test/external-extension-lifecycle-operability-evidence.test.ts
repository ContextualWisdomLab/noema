import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const moduleUrl = new URL(
  "../scripts/lib/external-extension-lifecycle-operability-evidence.mjs",
  import.meta.url,
);

async function loadEvaluator() {
  const modulePath = fileURLToPath(moduleUrl);
  expect(existsSync(modulePath)).toBe(true);
  if (!existsSync(modulePath)) {
    throw new Error("external-extension lifecycle operability evaluator is missing");
  }
  const implementation = await import(moduleUrl.href);
  return {
    evaluate: implementation.evaluateExternalExtensionLifecycleOperabilityEvidence as (
      evidence: unknown,
    ) => {
      status: "PASS" | "FAIL";
      checks: Array<{ code: string; pass: boolean }>;
      failures: Array<{ code: string; detail: string }>;
      metrics: {
        read_current_p95_ms: number | null;
        contended_append_p95_ms: number | null;
        storage_growth_bytes: number | null;
      };
    },
    percentile: implementation.nearestRankPercentile as (
      samples: readonly number[],
      percentile: number,
    ) => number,
  };
}

const latency = (value: number, count = 100): number[] => Array.from({ length: count }, () => value);

function passingEvidence() {
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
      latency_ms: latency(7),
      failure_count: 0,
      warmup_excluded_count: 0,
    },
    contended_append: {
      planned_samples: 100,
      latency_ms: latency(12),
      failure_count: 0,
      warmup_excluded_count: 0,
      contention_trials: 25,
      accepted_winners: 25,
      conflict_losers: 25,
    },
    recovery: {
      retained_event_count: 137,
      complete_audit_rebuild_verified: true,
      restart_recovery_verified: true,
      rollback_recovery_verified: true,
      malformed_head_rejected: true,
      truncated_audit_rejected: true,
    },
    storage: {
      bytes_before: 12_288,
      bytes_after: 98_304,
    },
  };
}

function failureCodes(result: { failures: Array<{ code: string }> }) {
  return result.failures.map((failure) => failure.code);
}

describe("external-extension lifecycle operability evidence", () => {
  it("accepts complete remote Durable Object evidence and computes p95 from retained samples", async () => {
    const { evaluate } = await loadEvaluator();
    const result = evaluate(passingEvidence());

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
    expect(result.metrics).toEqual({
      read_current_p95_ms: 7,
      contended_append_p95_ms: 12,
      storage_growth_bytes: 86_016,
    });
  });

  it("uses deterministic nearest-rank percentile semantics without hiding tail samples", async () => {
    const { percentile } = await loadEvaluator();
    const samples = [...latency(4, 94), 19, 21, 22, 23, 24, 25];

    expect(percentile(samples, 0.95)).toBe(19);
    expect(percentile([3, 1, 2], 1)).toBe(3);
  });

  it("rejects local, synthetic, fixture, and warm-up-excluded evidence", async () => {
    const { evaluate } = await loadEvaluator();
    for (const sourceKind of [
      "workerd_local",
      "synthetic",
      "fixture",
      "cloudflare_durable_object_local",
    ]) {
      const result = evaluate({ ...passingEvidence(), source_kind: sourceKind });
      expect(failureCodes(result)).toContain("source_kind");
    }

    const warmup = passingEvidence();
    warmup.read_current.warmup_excluded_count = 1;
    expect(failureCodes(evaluate(warmup))).toContain("read_current_denominator");
  });

  it("rejects sample shrinkage, failed requests, and a p95 above the 20 ms buyer path target", async () => {
    const { evaluate } = await loadEvaluator();
    const denominator = passingEvidence();
    denominator.read_current.planned_samples = 101;
    expect(failureCodes(evaluate(denominator))).toContain("read_current_denominator");

    const failed = passingEvidence();
    failed.contended_append.failure_count = 1;
    failed.contended_append.planned_samples = 101;
    expect(failureCodes(evaluate(failed))).toContain("contended_append_failures");

    const slow = passingEvidence();
    slow.read_current.latency_ms = [...latency(5, 94), ...latency(21, 6)];
    expect(failureCodes(evaluate(slow))).toContain("read_current_p95");
  });

  it("requires one winner and one conflict loser per contention trial", async () => {
    const { evaluate } = await loadEvaluator();
    const evidence = passingEvidence();
    evidence.contended_append.accepted_winners = 24;

    expect(failureCodes(evaluate(evidence))).toContain("contention_cas");
  });

  it("binds contended-append latency evidence to both attempts in every pairwise CAS trial", async () => {
    const { evaluate } = await loadEvaluator();
    const evidence = passingEvidence();
    evidence.contended_append.contention_trials = 49;
    evidence.contended_append.accepted_winners = 49;
    evidence.contended_append.conflict_losers = 49;

    expect(failureCodes(evaluate(evidence))).toContain("contention_sample_denominator");
  });

  it("requires history beyond the workflow receipt ring and full recovery/corruption evidence", async () => {
    const { evaluate } = await loadEvaluator();
    const shortHistory = passingEvidence();
    shortHistory.recovery.retained_event_count = 128;
    expect(failureCodes(evaluate(shortHistory))).toContain("audit_depth");

    const unrecovered = passingEvidence();
    unrecovered.recovery.rollback_recovery_verified = false;
    expect(failureCodes(evaluate(unrecovered))).toContain("recovery_rehearsal");
  });

  it("rejects non-canonical identity, timestamp, storage backend, and storage counters", async () => {
    const { evaluate } = await loadEvaluator();
    const evidence = passingEvidence();
    evidence.protected_main_sha = "ABC";
    evidence.observed_at = "2026-09-10T00:30:00Z";
    evidence.storage_backend = "kv";
    evidence.storage.bytes_after = -1;

    const codes = failureCodes(evaluate(evidence));
    expect(codes).toEqual(expect.arrayContaining([
      "source_identity",
      "observed_at",
      "storage_backend",
      "storage_growth",
    ]));
  });
});
