import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };
const originalArgv = [...process.argv];
const originalExitCode = process.exitCode;
const repositoryRoot = process.cwd();
const MAX_KPI_PROVENANCE_BYTES = 64 * 1024;

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

function writeProvenance(logPath: string, provenancePath: string) {
  const bytes = readFileSync(logPath);
  writeFileSync(
    provenancePath,
    JSON.stringify({
      sourceKind: "production",
      sourceId: "cloudflare-logpush:noema-production",
      sourceMethod: "log-url",
      logPath,
      records: 2,
      collectedAt: "2026-07-02T00:00:00.000Z",
      logSha256: createHash("sha256").update(bytes).digest("hex"),
      logBytes: bytes.byteLength,
    }),
    "utf8",
  );
}

afterEach(() => {
  vi.doUnmock("node:fs");
  vi.doUnmock("node:fs/promises");
  vi.restoreAllMocks();
  restoreProcessState();
});

describe("KPI strict provenance defensive coverage", () => {
  it("records an unreadable provenance path as a read failure", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-read-failure-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance-directory");
      const evidencePath = join(directory, "evidence.json");
      writeLog(logPath);
      mkdirSync(provenancePath);

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("KPI provenance file could not be read");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the runtime cannot provide O_NOFOLLOW", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-no-nofollow-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance.json");
      const evidencePath = join(directory, "evidence.json");
      writeLog(logPath);
      writeProvenance(logPath, provenancePath);

      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          constants: {
            ...actual.constants,
            O_NOFOLLOW: undefined,
          },
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("O_NOFOLLOW is unavailable");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a path-to-symlink replacement immediately before the no-follow open", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-pre-open-symlink-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance.json");
      const targetPath = join(directory, "replacement.json");
      const evidencePath = join(directory, "evidence.json");
      writeLog(logPath);
      writeProvenance(logPath, provenancePath);
      writeProvenance(logPath, targetPath);

      vi.doMock("node:fs/promises", async () => {
        const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
        return {
          ...actual,
          open: vi.fn(async (path, flags, mode) => {
            if (String(path) === provenancePath) {
              rmSync(provenancePath, { force: true });
              symlinkSync(targetPath, provenancePath);
            }
            return actual.open(path, flags, mode);
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("without following links");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects regular-file pathname replacement after descriptor verification but before reading", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-pre-read-replacement-"));
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
            if (String(path) !== provenancePath) return handle;
            let replaced = false;
            return {
              stat: vi.fn(async (...args: unknown[]) => {
                const state = await (handle.stat as (...values: unknown[]) => Promise<unknown>)(...args);
                if (!replaced) {
                  replaced = true;
                  rmSync(provenancePath, { force: true });
                  writeProvenance(logPath, provenancePath);
                }
                return state;
              }),
              read: handle.read.bind(handle),
              close: handle.close.bind(handle),
            };
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("changed between pathname resolution and descriptor verification");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects provenance that grows beyond the bounded buffer after descriptor stat", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-growth-race-"));
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
            if (String(path) !== provenancePath) return handle;
            let expanded = false;
            return {
              stat: handle.stat.bind(handle),
              read: vi.fn(async (...args: unknown[]) => {
                if (!expanded) {
                  expanded = true;
                  writeFileSync(
                    provenancePath,
                    " ".repeat(MAX_KPI_PROVENANCE_BYTES + 1),
                    { flag: "a" },
                  );
                }
                return (handle.read as (...values: unknown[]) => Promise<unknown>)(...args);
              }),
              close: handle.close.bind(handle),
            };
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("exceeds 65536-byte limit");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects regular-file pathname replacement while the verified descriptor is being read", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-path-replacement-"));
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
            if (String(path) !== provenancePath) return handle;
            let replaced = false;
            return {
              stat: handle.stat.bind(handle),
              read: vi.fn(async (...args: unknown[]) => {
                if (!replaced) {
                  replaced = true;
                  rmSync(provenancePath, { force: true });
                  writeProvenance(logPath, provenancePath);
                }
                return (handle.read as (...values: unknown[]) => Promise<unknown>)(...args);
              }),
              close: handle.close.bind(handle),
            };
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("changed while the bounded descriptor snapshot was being read");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when descriptor metadata cannot be read", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-stat-failure-"));
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
            if (String(path) !== provenancePath) return handle;
            return {
              stat: vi.fn(async () => {
                throw new Error("simulated descriptor stat failure");
              }),
              read: handle.read.bind(handle),
              close: handle.close.bind(handle),
            };
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("KPI provenance file could not be read");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the verified provenance descriptor cannot be closed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-close-failure-"));
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
            if (String(path) !== provenancePath) return handle;
            return {
              stat: handle.stat.bind(handle),
              read: handle.read.bind(handle),
              close: vi.fn(async () => {
                await handle.close();
                throw new Error("simulated close failure");
              }),
            };
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("could not close its verified descriptor");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a copied snapshot whose bytes differ from authenticated provenance", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-snapshot-mismatch-"));
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
          copyFile: vi.fn(async (source: string, destination: string) => {
            await actual.copyFile(source, destination);
            writeFileSync(destination, "tampered snapshot", "utf8");
          }),
        };
      });

      expect(await runGate(logPath, provenancePath, evidencePath)).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("changed before the verified snapshot could be established");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
