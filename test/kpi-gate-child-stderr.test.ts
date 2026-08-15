import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };
const originalArgv = [...process.argv];
const originalCwd = process.cwd();
const directories: string[] = [];

function restoreProcessState() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.argv.splice(0, process.argv.length, ...originalArgv);
  if (process.cwd() !== originalCwd) process.chdir(originalCwd);
}

afterEach(() => {
  vi.doUnmock("node:child_process");
  vi.restoreAllMocks();
  vi.resetModules();
  restoreProcessState();
  while (directories.length > 0) {
    rmSync(directories.pop()!, { recursive: true, force: true });
  }
});

describe("KPI gate child diagnostics", () => {
  it("forwards stderr from successful KPI child checks without treating it as KPI data", async () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-child-stderr-"));
    directories.push(directory);
    const logPath = join(directory, "exchange-30d.ndjson");
    writeFileSync(
      logPath,
      [
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 120,
          timestamp: "2026-06-01T00:00:00.000Z",
        }),
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 157,
          timestamp: "2026-07-01T03:00:00.000Z",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    restoreProcessState();
    delete process.env.NOEMA_KPI_STRICT;
    delete process.env.NOEMA_KPI_REQUIRE_WINDOW_DAYS;
    delete process.env.NOEMA_KPI_PROVENANCE_PATH;
    delete process.env.NOEMA_KPI_EVIDENCE_PATH;
    process.argv.splice(
      0,
      process.argv.length,
      originalArgv[0] ?? process.execPath,
      resolve(originalCwd, "scripts/kpi-gate.mjs"),
      logPath,
    );

    const diagnostics = ["kpi-check diagnostic\n", "kpi-alert diagnostic\n"];
    let call = 0;
    vi.resetModules();
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        spawnSync: vi.fn(() => {
          const stderr = diagnostics[call] ?? "";
          call += 1;
          const stdout = '{"status":"PASS"}\n';
          return {
            pid: 1,
            output: [null, stdout, stderr],
            stdout,
            stderr,
            status: 0,
            signal: null,
            error: undefined,
          };
        }),
      };
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../scripts/kpi-gate.mjs");

    expect(call).toBe(2);
    expect(stderrSpy).toHaveBeenNthCalledWith(1, diagnostics[0]);
    expect(stderrSpy).toHaveBeenNthCalledWith(2, diagnostics[1]);
    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"status": "PASS"'));
  });
});
