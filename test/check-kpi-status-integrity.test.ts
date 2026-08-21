import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runCheckKpi(logPath: string) {
  const env = { ...process.env };
  delete env.NOEMA_KPI_REQUIRE_WINDOW_DAYS;
  return spawnSync(process.execPath, ["scripts/check-kpi.mjs", logPath, "0.02", "300"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
}

describe("KPI HTTP status evidence integrity", () => {
  for (const statusCode of [99, 200.5, -1, 600]) {
    it(`rejects impossible HTTP status ${statusCode} instead of treating it as KPI evidence`, () => {
      const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-status-"));
      try {
        const logPath = join(dir, "exchange-30d.ndjson");
        writeFileSync(logPath, `${JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: statusCode,
          latency_ms: 10,
        })}\n`);

        const result = runCheckKpi(logPath);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Invalid exchange HTTP status in KPI log");
        expect(result.stdout).toBe("");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("accepts a canonical successful HTTP status", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-status-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, `${JSON.stringify({
        event: "http_request",
        route: "/exchange",
        status_code: 204,
        latency_ms: 10,
      })}\n`);

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        exchange_requests: 1,
        exchange_failures: 0,
        pass: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
