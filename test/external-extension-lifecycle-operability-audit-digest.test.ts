import { describe, expect, it } from "vitest";
import { main } from "../scripts/external-extension-lifecycle-operability-audit.mjs";

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
    storage: { bytes_before: 12_288, bytes_after: 65_536 },
  };
}

describe("external-extension lifecycle operability audit retained-byte identity", () => {
  it("emits only the descriptor-read SHA-256 needed by the deployment-authority gate", () => {
    const digest = "e".repeat(64);
    let output = "";

    const result = main({
      argv: ["node", "audit", "sensitive-path.json"],
      readEvidence: () => ({
        ok: true,
        path: "sensitive-path.json",
        value: passingEvidence(),
        sha256: digest,
      }),
      writeOutput: (value: string) => { output += value; },
      setExitCode: () => {},
    });

    expect(result.status).toBe("PASS");
    expect(JSON.parse(output)).toMatchObject({ evidence_sha256: digest, status: "PASS" });
    expect(output).not.toContain("sensitive-path.json");
    expect(output).not.toContain('"latency_ms"');
  });
});
