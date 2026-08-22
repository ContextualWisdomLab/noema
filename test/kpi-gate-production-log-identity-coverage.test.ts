import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function writeLog(path: string) {
  writeFileSync(
    path,
    [
      JSON.stringify({ event: "http_request", route: "/exchange", status_code: 200, latency_ms: 120, timestamp: "2026-06-01T00:00:00.000Z" }),
      JSON.stringify({ event: "http_request", route: "/exchange", status_code: 200, latency_ms: 150, timestamp: "2026-07-01T03:00:00.000Z" }),
    ].join("\n") + "\n",
    "utf8",
  );
}

function writeProvenance(logPath: string, provenancePath: string, records = 2) {
  const bytes = readFileSync(logPath);
  writeFileSync(
    provenancePath,
    JSON.stringify({
      sourceKind: "production",
      sourceId: "cloudflare-logpush:noema-production",
      sourceMethod: "log-url",
      logPath,
      records,
      collectedAt: "2026-07-02T00:00:00.000Z",
      logSha256: createHash("sha256").update(bytes).digest("hex"),
      logBytes: bytes.byteLength,
    }),
    "utf8",
  );
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

afterEach(() => {
  vi.doUnmock("node:fs");
  vi.doUnmock("node:fs/promises");
  vi.restoreAllMocks();
  restoreProcessState();
});

describe("strict KPI production-log identity coverage", () => {
  it("rejects provenance whose record count disagrees with the authenticated log bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-record-mismatch-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance.json");
      const evidencePath = join(directory, "evidence.json");
      writeLog(logPath);
      writeProvenance(logPath, provenancePath, 1);

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain(
        "KPI provenance records do not match the authenticated production log",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed if O_NOFOLLOW becomes unavailable before production-log verification", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-log-nofollow-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance.json");
      const evidencePath = join(directory, "evidence.json");
      writeLog(logPath);
      writeProvenance(logPath, provenancePath);
      let snapshotHandleOpened = false;
      let injectedNoFollowFailure = false;

      vi.doMock("node:fs/promises", async () => {
        const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
        return {
          ...actual,
          open: vi.fn(async (path, flags, mode) => {
            const handle = await actual.open(path, flags, mode);
            if (
              String(path) !== logPath
              && String(path) !== provenancePath
              && String(path).endsWith("exchange-30d.ndjson")
            ) {
              snapshotHandleOpened = true;
            }
            return handle;
          }),
        };
      });
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          constants: new Proxy(actual.constants, {
            get(target, property, receiver) {
              if (property === "O_NOFOLLOW" && snapshotHandleOpened && !injectedNoFollowFailure) {
                injectedNoFollowFailure = true;
                return undefined;
              }
              return Reflect.get(target, property, receiver);
            },
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(injectedNoFollowFailure).toBe(true);
      expect(readFileSync(evidencePath, "utf8")).toContain(
        "KPI log could not be copied into a permission-restricted verified snapshot.",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a production log that changes while its verified descriptor is being read", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-log-read-race-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance.json");
      const evidencePath = join(directory, "evidence.json");
      writeLog(logPath);
      writeProvenance(logPath, provenancePath);

      vi.doMock("node:fs/promises", async () => {
        const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
        return {
          ...actual,
          open: vi.fn(async (path, flags, mode) => {
            const handle = await actual.open(path, flags, mode);
            if (String(path) !== logPath) return handle;
            let mutated = false;
            return {
              stat: handle.stat.bind(handle),
              read: vi.fn(async (...args: unknown[]) => {
                const result = await (handle.read as (...values: unknown[]) => Promise<{ bytesRead: number }>)(...args);
                if (!mutated && result.bytesRead > 0) {
                  mutated = true;
                  appendFileSync(logPath, " \n", "utf8");
                }
                return result;
              }),
              close: handle.close.bind(handle),
            } as typeof handle;
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain(
        "KPI log changed while its verified descriptor was being read",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
