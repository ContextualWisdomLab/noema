import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };
const originalArgv = [...process.argv];

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
  const bytes = Buffer.from(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  writeFileSync(path, bytes);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

async function runStrictGate(logPath: string, provenancePath: string, evidencePath: string) {
  restoreProcessState();
  Object.assign(process.env, {
    NOEMA_KPI_PROVENANCE_PATH: provenancePath,
    NOEMA_KPI_EVIDENCE_PATH: evidencePath,
    NOEMA_KPI_STRICT: "1",
    NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
  });
  process.argv.splice(
    0,
    process.argv.length,
    originalArgv[0] ?? process.execPath,
    resolve(process.cwd(), "scripts/kpi-gate.mjs"),
    logPath,
  );

  vi.resetModules();
  const logs: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...values: unknown[]) => {
    logs.push(values.map(String).join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as never);

  let exitCode: number | null = null;
  try {
    await import("../scripts/kpi-gate.mjs");
  } catch (error) {
    if (error instanceof ExitSignal) exitCode = error.code;
    else throw error;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    restoreProcessState();
  }
  return { exitCode, logs };
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreProcessState();
});

describe("strict KPI provenance log path identity", () => {
  it("rejects provenance that claims a different logPath from the bytes being verified", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-log-path-identity-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = `${logPath}.provenance.json`;
      const evidencePath = join(directory, "evidence.json");
      const identity = writeThirtyDayLog(logPath);
      writeFileSync(
        provenancePath,
        `${JSON.stringify({
          sourceKind: "production",
          sourceId: "cloudflare-logpush:noema-production",
          sourceMethod: "log-url",
          logPath: join(directory, "different-production-log.ndjson"),
          records: 2,
          collectedAt: "2026-07-02T00:00:00.000Z",
          ...identity,
        }, null, 2)}\n`,
      );

      const result = await runStrictGate(logPath, provenancePath, evidencePath);

      expect(result.exitCode).toBe(1);
      expect(result.logs.join("\n")).toContain(
        "KPI provenance logPath must exactly identify the production log being verified",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
