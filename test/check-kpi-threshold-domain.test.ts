import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runCheckKpi(logPath: string, failureThreshold: string, p95Threshold: string) {
  const env = { ...process.env };
  delete env.NOEMA_KPI_REQUIRE_WINDOW_DAYS;
  return spawnSync(process.execPath, ["scripts/check-kpi.mjs", logPath, failureThreshold, p95Threshold], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
}

function withHealthyExchangeLog(run: (logPath: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-threshold-"));
  try {
    const logPath = join(dir, "exchange-30d.ndjson");
    writeFileSync(logPath, `${JSON.stringify({
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 10,
    })}\n`);
    run(logPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("KPI threshold authority domain", () => {
  it("rejects a failure-rate threshold above the mathematical maximum instead of manufacturing a pass", () => {
    withHealthyExchangeLog((logPath) => {
      const result = runCheckKpi(logPath, "1.01", "300");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("failure threshold must be between 0 and 1");
      expect(result.stdout).toBe("");
    });
  });

  it("rejects a negative failure-rate threshold as impossible threshold authority", () => {
    withHealthyExchangeLog((logPath) => {
      const result = runCheckKpi(logPath, "-0.01", "300");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("failure threshold must be between 0 and 1");
      expect(result.stdout).toBe("");
    });
  });

  it("rejects a negative latency threshold instead of accepting impossible threshold authority", () => {
    withHealthyExchangeLog((logPath) => {
      const result = runCheckKpi(logPath, "0.02", "-1");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("p95 threshold must be non-negative");
      expect(result.stdout).toBe("");
    });
  });
});
