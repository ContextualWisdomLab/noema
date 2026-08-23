import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`EXIT:${code}`);
  }
}

function writeThirtyDayLog(path: string) {
  const records = [
    {
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 120,
      timestamp: "2026-06-01T00:00:00.000Z",
    },
    {
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 150,
      timestamp: "2026-07-01T03:00:00.000Z",
    },
  ];
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function logIdentity(path: string) {
  const bytes = readFileSync(path);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

describe("strict KPI source identity production coverage", () => {
  it("executes the fail-closed canonical-sourceId branch in-process", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-source-id-coverage-"));
    const logPath = join(directory, "exchange-30d.ndjson");
    const provenancePath = `${logPath}.provenance.json`;
    const evidencePath = join(directory, "evidence.json");
    const originalEnvironment = { ...process.env };
    const originalArgv = [...process.argv];
    const originalExitCode = process.exitCode;

    try {
      writeThirtyDayLog(logPath);
      writeFileSync(
        provenancePath,
        `${JSON.stringify({
          sourceKind: "production",
          sourceId: " cloudflare-logpush:noema-production",
          sourceMethod: "log-url",
          logPath,
          records: 2,
          collectedAt: "2026-07-02T00:00:00.000Z",
          ...logIdentity(logPath),
        }, null, 2)}\n`,
      );

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
        resolve("scripts/kpi-gate.mjs"),
      );

      vi.resetModules();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new ExitSignal(code ?? 0);
      }) as never);

      let exitCode: number | null = null;
      let unexpectedError: unknown = null;
      try {
        await import("../scripts/kpi-gate.mjs");
      } catch (error) {
        if (error instanceof ExitSignal) exitCode = error.code;
        else unexpectedError = error;
      } finally {
        exitSpy.mockRestore();
        errorSpy.mockRestore();
        logSpy.mockRestore();
      }

      if (unexpectedError) throw unexpectedError;
      expect(exitCode).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain(
        "KPI provenance sourceId must be canonical without surrounding whitespace.",
      );
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnvironment)) delete process.env[key];
      }
      Object.assign(process.env, originalEnvironment);
      process.argv.splice(0, process.argv.length, ...originalArgv);
      process.exitCode = originalExitCode;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
