import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("emits a bounded PASS without echoing retained raw latency samples or the input pathname", () => {
    let output = "";
    let exitCode: number | null = null;
    const result = main({
      argv: ["node", "audit", "tenant-secret-evidence.json"],
      readEvidence: () => ({ ok: true, path: "tenant-secret-evidence.json", value: passingEvidence() }),
      writeOutput: (value: string) => { output += value; },
      setExitCode: (code: number) => { exitCode = code; },
    });

    expect(result.status).toBe("PASS");
    expect(exitCode).toBeNull();
    expect(output).toContain('"read_current_p95_ms":5');
    expect(output).not.toContain('"latency_ms"');
    expect(output).not.toContain("tenant-secret-evidence.json");
  });

  it("fails closed when descriptor-safe retained evidence cannot be read without echoing the input pathname", () => {
    let output = "";
    let exitCode: number | null = null;
    const result = main({
      argv: ["node", "audit", "tenant-unsafe.json"],
      readEvidence: () => ({ ok: false, path: "tenant-unsafe.json", reason: "duplicate_keys" }),
      writeOutput: (value: string) => { output += value; },
      setExitCode: (code: number) => { exitCode = code; },
    });

    expect(result.status).toBe("FAIL");
    expect(exitCode).toBe(1);
    expect(output).toContain('"code":"evidence_collection"');
    expect(output).toContain("duplicate_keys");
    expect(output).not.toContain('"latency_ms"');
    expect(output).not.toContain("tenant-unsafe.json");
  });

  it("exercises the production dependency defaults instead of excluding them from coverage", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-lifecycle-operability-"));
    const evidencePath = join(directory, "evidence.json");
    const previousExitCode = process.exitCode;

    try {
      writeFileSync(evidencePath, `${JSON.stringify(passingEvidence())}\n`, { encoding: "utf8", mode: 0o600 });

      const defaultArgv = main({
        readEvidence: () => ({ ok: true, path: "ignored.json", value: passingEvidence() }),
        writeOutput: () => {},
        setExitCode: () => {},
      });
      expect(defaultArgv.status).toBe("PASS");

      const defaultReader = main({
        argv: ["node", "audit", evidencePath],
        writeOutput: () => {},
        setExitCode: () => {},
      });
      expect(defaultReader.status).toBe("PASS");

      const defaultWriter = main({
        argv: ["node", "audit", "ignored.json"],
        readEvidence: () => ({ ok: true, path: "ignored.json", value: passingEvidence() }),
        setExitCode: () => {},
      });
      expect(defaultWriter.status).toBe("PASS");

      const defaultExitCode = main({
        argv: ["node", "audit", "ignored.json"],
        readEvidence: () => ({ ok: false, path: "ignored.json", reason: "duplicate_keys" }),
        writeOutput: () => {},
      });
      expect(defaultExitCode.status).toBe("FAIL");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      rmSync(directory, { recursive: true, force: true });
    }
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
