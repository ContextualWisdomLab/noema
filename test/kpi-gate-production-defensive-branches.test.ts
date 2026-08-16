import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };
const originalArgv = [...process.argv];
const originalExitCode = process.exitCode;
const originalCwd = process.cwd();
const directories: string[] = [];

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`EXIT:${code}`);
  }
}

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "noema-kpi-defensive-"));
  directories.push(directory);
  return {
    directory,
    logPath: join(directory, "exchange-30d.ndjson"),
    provenancePath: join(directory, "exchange-30d.ndjson.provenance.json"),
    evidencePath: join(directory, "evidence.json"),
  };
}

function writeThirtyDayExchangeLog(path: string) {
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
      latency_ms: 157,
      timestamp: "2026-07-01T03:00:00.000Z",
    },
  ];
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

function identity(path: string) {
  const bytes = readFileSync(path);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

function validProvenance(logPath: string) {
  return {
    sourceKind: "production",
    sourceId: "cloudflare-logpush:noema-production",
    sourceMethod: "log-url",
    logPath,
    records: 2,
    collectedAt: "2026-07-02T00:00:00.000Z",
    ...identity(logPath),
  };
}

function writeProvenance(
  fixture: ReturnType<typeof createFixture>,
  transform?: (value: Record<string, unknown>) => Record<string, unknown>,
) {
  const initial = validProvenance(fixture.logPath) as Record<string, unknown>;
  const value = transform ? transform(initial) : initial;
  writeFileSync(fixture.provenancePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function restoreProcessState() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.argv.splice(0, process.argv.length, ...originalArgv);
  process.exitCode = originalExitCode;
  if (process.cwd() !== originalCwd) process.chdir(originalCwd);
}

async function runGate({
  args = [],
  env = {},
  clearEnv = [],
  cwd,
}: {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  clearEnv?: string[];
  cwd?: string;
} = {}) {
  restoreProcessState();
  for (const key of clearEnv) delete process.env[key];
  Object.assign(process.env, env);
  if (cwd) process.chdir(cwd);
  process.argv.splice(
    0,
    process.argv.length,
    originalArgv[0] ?? process.execPath,
    resolve(originalCwd, "scripts/kpi-gate.mjs"),
    ...args,
  );

  vi.resetModules();
  const previousExitListeners = new Set(process.listeners("exit"));
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...values: unknown[]) => {
    logs.push(values.map(String).join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...values: unknown[]) => {
    errors.push(values.map(String).join(" "));
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as never);

  let exitCode: number | null = null;
  let error: unknown = null;
  try {
    await import("../scripts/kpi-gate.mjs");
  } catch (caught) {
    if (caught instanceof ExitSignal) exitCode = caught.code;
    else error = caught;
  } finally {
    for (const listener of process.listeners("exit")) {
      if (!previousExitListeners.has(listener)) {
        listener(0);
        process.removeListener("exit", listener);
      }
    }
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    restoreProcessState();
  }
  if (error) throw error;
  return { exitCode, logs, errors };
}

function spawnResult(stdout: string, stderr = "", status = 0) {
  return {
    pid: 1,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
    error: undefined,
  };
}

async function mockSpawnOutputs(outputs: string[], mutate?: (call: number) => void) {
  let call = 0;
  vi.doMock("node:child_process", async () => {
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    return {
      ...actual,
      spawnSync: vi.fn(() => {
        call += 1;
        mutate?.(call);
        return spawnResult(outputs[call - 1] ?? "");
      }),
    };
  });
}

afterEach(() => {
  vi.doUnmock("node:child_process");
  vi.doUnmock("node:fs");
  vi.doUnmock("node:fs/promises");
  vi.restoreAllMocks();
  restoreProcessState();
});

afterAll(() => {
  restoreProcessState();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("KPI gate production defensive branch coverage", () => {
  it("uses CLI defaults without fabricating a log, provenance source, evidence path, or observation window", async () => {
    const fixture = createFixture();
    const result = await runGate({
      cwd: fixture.directory,
      clearEnv: [
        "NOEMA_KPI_LOG_PATH",
        "NOEMA_KPI_PROVENANCE_PATH",
        "NOEMA_KPI_FAILURE_THRESHOLD",
        "NOEMA_KPI_P95_THRESHOLD_MS",
        "NOEMA_KPI_REQUIRE_WINDOW_DAYS",
        "NOEMA_KPI_STRICT",
        "NOEMA_KPI_EVIDENCE_PATH",
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("No KPI log file: exchange-30d.ndjson");
  });

  it("rejects an invalid p95 threshold even when the failure threshold is valid", async () => {
    const fixture = createFixture();
    const result = await runGate({ args: [fixture.logPath, "0.02", "not-a-number"] });
    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("Invalid threshold values");
  });

  it("rejects a strict require-window flag with no following value", async () => {
    const result = await runGate({
      args: ["--strict", "--require-window-days"],
      clearEnv: ["NOEMA_KPI_REQUIRE_WINDOW_DAYS"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("positive finite number");
  });

  it("fails closed for missing and type-invalid provenance fields", async () => {
    const cases: Array<{
      transform: (value: Record<string, unknown>) => Record<string, unknown>;
      reason: string;
    }> = [
      {
        transform: (value) => {
          delete value.sourceKind;
          return value;
        },
        reason: 'got "missing"',
      },
      {
        transform: (value) => ({ ...value, sourceId: 42 }),
        reason: "sourceId is required",
      },
      {
        transform: (value) => ({ ...value, collectedAt: 42 }),
        reason: "collectedAt",
      },
      {
        transform: (value) => ({ ...value, records: "not-a-number" }),
        reason: "records must be a positive number",
      },
      {
        transform: (value) => ({ ...value, logSha256: 42 }),
        reason: "logSha256",
      },
      {
        transform: (value) => ({ ...value, logBytes: 1.5 }),
        reason: "positive safe integer",
      },
    ];

    for (const testCase of cases) {
      const fixture = createFixture();
      writeThirtyDayExchangeLog(fixture.logPath);
      writeProvenance(fixture, testCase.transform);
      const result = await runGate({
        env: {
          NOEMA_KPI_LOG_PATH: fixture.logPath,
          NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
          NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
          NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
          NOEMA_KPI_STRICT: "1",
        },
      });
      expect(result.exitCode).toBe(1);
      const evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8")) as { reason?: string };
      expect(evidence.reason).toContain(testCase.reason);
    }
  });

  it("checks byte-size identity when the provenance digest itself matches", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture, (value) => ({
      ...value,
      logBytes: Number(value.logBytes) + 1,
    }));

    const result = await runGate({
      env: {
        NOEMA_KPI_LOG_PATH: fixture.logPath,
        NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
        NOEMA_KPI_STRICT: "1",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("identity does not match production provenance");
  });

  it("accepts valid provenance without optional logPath or sourceMethod fields", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture, (value) => {
      delete value.logPath;
      delete value.sourceMethod;
      return value;
    });

    const result = await runGate({
      env: {
        NOEMA_KPI_LOG_PATH: fixture.logPath,
        NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
        NOEMA_KPI_STRICT: "1",
      },
    });
    expect(result.exitCode).toBeNull();
    const evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    expect(evidence.provenance.logPath).toBeNull();
    expect(evidence.provenance.sourceMethod).toBeNull();
  });

  it("fails closed when a provenance-bound log exists but cannot be streamed", async () => {
    const fixture = createFixture();
    mkdirSync(fixture.logPath);
    writeFileSync(
      fixture.provenancePath,
      `${JSON.stringify({
        sourceKind: "production",
        sourceId: "cloudflare-logpush:noema-production",
        records: 1,
        collectedAt: "2026-07-02T00:00:00.000Z",
        logSha256: "0".repeat(64),
        logBytes: 1,
      })}\n`,
      "utf8",
    );

    const result = await runGate({
      env: {
        NOEMA_KPI_LOG_PATH: fixture.logPath,
        NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
        NOEMA_KPI_STRICT: "1",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("identity could not be computed");
  });

  it("cleans a snapshot directory when copy fails after temporary-directory creation", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    vi.doMock("node:fs/promises", async () => {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      return {
        ...actual,
        copyFile: vi.fn(async () => {
          throw new Error("simulated copy failure");
        }),
      };
    });

    const result = await runGate({
      env: {
        NOEMA_KPI_LOG_PATH: fixture.logPath,
        NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
        NOEMA_KPI_STRICT: "1",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("permission-restricted verified snapshot");
  });

  it("fails evidence persistence safely on platforms without O_NOFOLLOW", async () => {
    const fixture = createFixture();
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

    const result = await runGate({
      env: {
        NOEMA_KPI_LOG_PATH: fixture.logPath,
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_STRICT: "0",
      },
      clearEnv: ["NOEMA_KPI_REQUIRE_WINDOW_DAYS"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.errors.join("\n")).toContain("Failed to write KPI evidence file");
  });

  it("treats empty, non-JSON, malformed, and incomplete child output as untrusted diagnostics", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);

    await mockSpawnOutputs(["", "plain diagnostic"]);
    let result = await runGate({
      args: [fixture.logPath],
      clearEnv: [
        "NOEMA_KPI_REQUIRE_WINDOW_DAYS",
        "NOEMA_KPI_PROVENANCE_PATH",
      ],
      env: {
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_STRICT: "0",
      },
    });
    expect(result.exitCode).toBeNull();
    let evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    expect(evidence.parsed).toEqual({ check: null, alert: null });

    vi.doUnmock("node:child_process");
    await mockSpawnOutputs(["{not-json}", "prefix {\"incomplete\":1"]);
    result = await runGate({
      args: [fixture.logPath],
      clearEnv: [
        "NOEMA_KPI_REQUIRE_WINDOW_DAYS",
        "NOEMA_KPI_PROVENANCE_PATH",
      ],
      env: {
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_STRICT: "0",
      },
    });
    expect(result.exitCode).toBeNull();
    evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    expect(evidence.parsed).toEqual({ check: null, alert: null });
  });

  it("fails strict verification when the original log identity changes during child checks", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    await mockSpawnOutputs(['{"pass":true}', '{"pass":true}'], (call) => {
      if (call === 1) {
        const current = readFileSync(fixture.logPath, "utf8");
        writeFileSync(fixture.logPath, current.replace('"latency_ms":120', '"latency_ms":121'), "utf8");
      }
    });

    const result = await runGate({
      env: {
        NOEMA_KPI_LOG_PATH: fixture.logPath,
        NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
        NOEMA_KPI_STRICT: "1",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("identity changed while KPI checks were running");
  });

  it("fails strict verification when the original log disappears during child checks", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    await mockSpawnOutputs(['{"pass":true}', '{"pass":true}'], (call) => {
      if (call === 2) rmSync(fixture.logPath, { force: true });
    });

    const result = await runGate({
      env: {
        NOEMA_KPI_LOG_PATH: fixture.logPath,
        NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
        NOEMA_KPI_EVIDENCE_PATH: fixture.evidencePath,
        NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
        NOEMA_KPI_STRICT: "1",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("Failed to re-read KPI log identity");
  });
});
