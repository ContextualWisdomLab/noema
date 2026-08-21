import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };
const originalArgv = [...process.argv];
const originalExitCode = process.exitCode;
const repositoryRoot = process.cwd();

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`EXIT:${code}`);
  }
}

function restoreProcessState() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.argv.splice(0, process.argv.length, ...originalArgv);
  process.exitCode = originalExitCode;
}

async function runGate(logPath: string, provenancePath: string, evidencePath: string) {
  restoreProcessState();
  Object.assign(process.env, {
    NOEMA_KPI_LOG_PATH: logPath,
    NOEMA_KPI_PROVENANCE_PATH: provenancePath,
    NOEMA_KPI_EVIDENCE_PATH: evidencePath,
    NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
    NOEMA_KPI_STRICT: "1",
  });
  process.argv.splice(
    0,
    process.argv.length,
    originalArgv[0] ?? process.execPath,
    resolve(repositoryRoot, "scripts/kpi-gate.mjs"),
  );

  vi.resetModules();
  const existingExitListeners = new Set(process.listeners("exit"));
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as never);
  let exitCode: number | null = null;
  let unexpected: unknown = null;
  try {
    await import("../scripts/kpi-gate.mjs");
  } catch (error) {
    if (error instanceof ExitSignal) exitCode = error.code;
    else unexpected = error;
  } finally {
    for (const listener of process.listeners("exit")) {
      if (!existingExitListeners.has(listener)) {
        listener(0);
        process.removeListener("exit", listener);
      }
    }
    exitSpy.mockRestore();
    restoreProcessState();
  }
  if (unexpected) throw unexpected;
  return exitCode;
}

function productionLogBytes(): Buffer {
  return Buffer.from([
    JSON.stringify({ event: "http_request", route: "/exchange", status_code: 200, latency_ms: 120, timestamp: "2026-07-20T00:00:00.000Z" }),
    JSON.stringify({ event: "http_request", route: "/exchange", status_code: 200, latency_ms: 150, timestamp: "2026-08-20T00:00:00.000Z" }),
  ].join("\n") + "\n", "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreProcessState();
});

describe("strict KPI production-log path integrity", () => {
  it("rejects a production log symlink even when the target bytes match authenticated provenance", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-log-symlink-"));
    try {
      const targetPath = join(directory, "retargetable.ndjson");
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance.json");
      const evidencePath = join(directory, "evidence.json");
      const bytes = productionLogBytes();
      writeFileSync(targetPath, bytes);
      symlinkSync(targetPath, logPath);
      writeFileSync(provenancePath, JSON.stringify({
        sourceKind: "production",
        sourceId: "cloudflare-logpush:noema-production",
        sourceMethod: "log-url",
        logPath,
        records: 2,
        collectedAt: "2026-08-21T00:00:00.000Z",
        logSha256: createHash("sha256").update(bytes).digest("hex"),
        logBytes: bytes.byteLength,
      }));

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("KPI log");
      expect(readFileSync(evidencePath, "utf8")).toContain("stable regular file");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
