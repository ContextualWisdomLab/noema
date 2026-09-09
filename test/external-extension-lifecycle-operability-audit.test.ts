import { describe, expect, it } from "vitest";
import {
  main,
  resolveEvidencePath,
  runIfDirect,
} from "../scripts/external-extension-lifecycle-operability-audit.mjs";

const latency = (value: number): number[] => Array.from({ length: 100 }, () => value);

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
      latency_ms: latency(5),
      failure_count: 0,
      warmup_excluded_count: 0,
    },
    contended_append: {
      planned_samples: 100,
      latency_ms: latency(10),
      failure_count: 0,
      warmup_excluded_count: 0,
      contention_trials: 10,
      accepted_winners: 10,
      conflict_losers: 10,
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
      bytes_before: 12_288,
      bytes_after: 65_536,
    },
  };
}

describe("external-extension lifecycle operability audit CLI", () => {
  it("uses the default path for a missing or blank positional argument", () => {
    expect(resolveEvidencePath(["node", "audit"])).toBe(
      "external-extension-lifecycle-operability-evidence.json",
    );
    expect(resolveEvidencePath(["node", "audit", "   "])).toBe(
      "external-extension-lifecycle-operability-evidence.json",
    );
    expect(resolveEvidencePath(["node", "audit", "evidence.json"])).toBe("evidence.json");
  });

  it("emits a bounded PASS without echoing retained raw latency samples", () => {
    let output = "";
    let exitCode: number | null = null;
    const result = main({
      argv: ["node", "audit", "evidence.json"],
      readEvidence: () => ({ ok: true, path: "evidence.json", value: passingEvidence() }),
      writeOutput: (value: string) => { output += value; },
      setExitCode: (code: number) => { exitCode = code; },
    });

    expect(result.status).toBe("PASS");
    expect(exitCode).toBeNull();
    expect(output).toContain('"read_current_p95_ms":5');
    expect(output).not.toContain('"latency_ms"');
  });

  it("fails closed when descriptor-safe retained evidence cannot be read", () => {
    let output = "";
    let exitCode: number | null = null;
    const result = main({
      argv: ["node", "audit", "unsafe.json"],
      readEvidence: () => ({ ok: false, path: "unsafe.json", reason: "duplicate_keys" }),
      writeOutput: (value: string) => { output += value; },
      setExitCode: (code: number) => { exitCode = code; },
    });

    expect(result.status).toBe("FAIL");
    expect(exitCode).toBe(1);
    expect(output).toContain('"code":"evidence_collection"');
    expect(output).not.toContain("duplicate_keys\"");
  });

  it("executes only for the exact direct module URL", () => {
    let calls = 0;
    const execute = () => { calls += 1; };

    expect(runIfDirect("file:///tmp/a.mjs", ["node"], execute)).toBe(false);
    expect(runIfDirect("file:///tmp/a.mjs", ["node", "/tmp/b.mjs"], execute)).toBe(false);
    expect(runIfDirect("file:///tmp/a.mjs", ["node", "/tmp/a.mjs"], execute)).toBe(true);
    expect(calls).toBe(1);
  });
});
