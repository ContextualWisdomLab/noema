import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };
const originalArgv = [...process.argv];
const originalExitCode = process.exitCode;
const directories: string[] = [];

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`EXIT:${code}`);
  }
}

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "noema-kpi-production-"));
  directories.push(directory);
  return {
    directory,
    logPath: join(directory, "exchange-30d.ndjson"),
    provenancePath: join(directory, "exchange-30d.ndjson.provenance.json"),
    evidencePath: join(directory, "evidence.json"),
  };
}

function writeThirtyDayExchangeLog(path: string, statusCode = 200, errorCode = "") {
  const records = [
    {
      event: "http_request",
      route: "/exchange",
      status_code: statusCode,
      latency_ms: 120,
      timestamp: "2026-06-01T00:00:00.000Z",
      ...(errorCode ? { error_code: errorCode } : {}),
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

function restoreProcessState() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.argv.splice(0, process.argv.length, ...originalArgv);
  process.exitCode = originalExitCode;
}

async function runGate({
  fixture,
  args = [],
  env = {},
  evidence = true,
}: {
  fixture: ReturnType<typeof createFixture>;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  evidence?: boolean;
}) {
  restoreProcessState();
  Object.assign(process.env, {
    NOEMA_KPI_LOG_PATH: fixture.logPath,
    NOEMA_KPI_PROVENANCE_PATH: fixture.provenancePath,
    NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
    ...env,
  });
  if (evidence) process.env.NOEMA_KPI_EVIDENCE_PATH = fixture.evidencePath;
  else delete process.env.NOEMA_KPI_EVIDENCE_PATH;
  process.argv.splice(
    0,
    process.argv.length,
    originalArgv[0] ?? process.execPath,
    resolve("scripts/kpi-gate.mjs"),
    ...args,
  );

  vi.resetModules();
  const previousExitListeners = new Set(process.listeners("exit"));
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
  return { exitCode };
}

function writeProvenance(fixture: ReturnType<typeof createFixture>, overrides = {}) {
  writeFileSync(
    fixture.provenancePath,
    `${JSON.stringify({ ...validProvenance(fixture.logPath), ...overrides }, null, 2)}\n`,
    "utf8",
  );
}

afterAll(() => {
  restoreProcessState();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("KPI gate production entrypoint coverage", () => {
  it("persists a non-strict missing-log SKIP without manufacturing production evidence", async () => {
    const fixture = createFixture();
    const result = await runGate({
      fixture,
      env: {
        NOEMA_KPI_STRICT: "0",
        NOEMA_KPI_FAILURE_THRESHOLD: "0.02",
        NOEMA_KPI_P95_THRESHOLD_MS: "300",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(fixture.evidencePath, "utf8"))).toMatchObject({
      status: "SKIP",
      strict: false,
    });
  });

  it("takes the no-evidence-path branch for a non-strict missing log", async () => {
    const fixture = createFixture();
    const result = await runGate({ fixture, evidence: false, env: { NOEMA_KPI_STRICT: "0" } });
    expect(result.exitCode).toBe(0);
  });

  it("rejects non-numeric thresholds before reading the log", async () => {
    const fixture = createFixture();
    const result = await runGate({ fixture, args: [fixture.logPath, "nan", "300"] });
    expect(result.exitCode).toBe(1);
  });

  it("rejects a non-positive strict window", async () => {
    const fixture = createFixture();
    const result = await runGate({
      fixture,
      args: ["--strict", "--require-window-days", "0", fixture.logPath],
      env: { NOEMA_KPI_STRICT: "0" },
    });
    expect(result.exitCode).toBe(1);
  });

  it("fails strict mode when the production log is missing", async () => {
    const fixture = createFixture();
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(readFileSync(fixture.evidencePath, "utf8")).status).toBe("FAIL");
  });

  it("fails strict mode when provenance is missing", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("Missing KPI provenance file");
  });

  it("rejects malformed provenance UTF-8", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeFileSync(fixture.provenancePath, Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xc3, 0x28, 0x7d]));
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("not valid UTF-8");
  });

  it("rejects duplicate decoded provenance keys before JSON.parse", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    const valid = validProvenance(fixture.logPath);
    writeFileSync(
      fixture.provenancePath,
      `{"sourceKind":"production","source\\u004bind":"staging","sourceId":"${valid.sourceId}","records":2,"collectedAt":"${valid.collectedAt}","logSha256":"${valid.logSha256}","logBytes":${valid.logBytes}}`,
      "utf8",
    );
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("duplicate decoded JSON object keys");
  });

  it("rejects malformed provenance JSON", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeFileSync(fixture.provenancePath, "{", "utf8");
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("not valid JSON");
  });

  it.each([
    [{ sourceKind: "staging" }, "sourceKind"],
    [{ sourceId: "" }, "sourceId is required"],
    [{ sourceId: "https://logs.example/?token=secret" }, "stable non-secret label"],
    [{ collectedAt: "not-a-date" }, "collectedAt"],
    [{ records: 0 }, "records must be a positive number"],
    [{ logSha256: "BAD" }, "logSha256"],
    [{ logBytes: 0 }, "logBytes"],
  ])("rejects invalid strict provenance %#", async (overrides, reason) => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture, overrides);
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain(reason);
  });

  it("rejects provenance whose authenticated bytes no longer match the log", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    writeFileSync(fixture.logPath, `${readFileSync(fixture.logPath, "utf8")}{}\n`, "utf8");
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("identity does not match production provenance");
  });

  it("fails closed when a verified snapshot cannot be created", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    const missingTmp = join(fixture.directory, "missing-tmp");
    const result = await runGate({
      fixture,
      env: { NOEMA_KPI_STRICT: "1", TMPDIR: missingTmp, TMP: missingTmp, TEMP: missingTmp },
    });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.evidencePath, "utf8")).toContain("permission-restricted verified snapshot");
  });

  it("passes a real strict 30-day production gate and persists exact provenance", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    const result = await runGate({
      fixture,
      args: ["--strict", "--require-window-days", "30", fixture.logPath, "0.02", "300"],
      env: { NOEMA_KPI_STRICT: "0" },
    });

    expect(result.exitCode).toBeNull();
    const evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    expect(evidence.status).toBe("PASS");
    expect(evidence.provenance).toMatchObject(identity(fixture.logPath));
    expect(evidence.steps).toContainEqual({
      name: "kpi-log-identity-final",
      status: "PASS",
      exitCode: 0,
    });
  });

  it("parses escaped child JSON output without losing string-boundary state", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath, 200, "ERR_CUSTOM_\\_BOUNDARY");
    writeProvenance(fixture);
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });

    expect(result.exitCode).toBeNull();
    const evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    expect(evidence.parsed.alert.alerts.errorCodeTop10).toContainEqual({
      error_code: "ERR_CUSTOM_\\_BOUNDARY",
      count: 1,
    });
  });

  it("records a realistic KPI child failure instead of converting it to PASS", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath, 500);
    writeProvenance(fixture);
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    const evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    expect(evidence.status).toBe("FAIL");
    expect(evidence.steps.some((step: { status: string }) => step.status === "FAIL")).toBe(true);
  });

  it("fails strict mode when the final evidence path cannot be opened safely", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    mkdirSync(fixture.evidencePath);
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
  });

  it("refuses a symlink evidence target through O_NOFOLLOW", async () => {
    const fixture = createFixture();
    writeThirtyDayExchangeLog(fixture.logPath);
    writeProvenance(fixture);
    const target = join(fixture.directory, "target.json");
    writeFileSync(target, "sentinel", "utf8");
    symlinkSync(target, fixture.evidencePath);
    const result = await runGate({ fixture, env: { NOEMA_KPI_STRICT: "1" } });
    expect(result.exitCode).toBe(1);
    expect(readFileSync(target, "utf8")).toBe("sentinel");
  });
});
