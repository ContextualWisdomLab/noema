import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runAlerts(logPath: string) {
  const env = { ...process.env };
  delete env.NOEMA_ALERT_5M_FAILURE_RATE;
  delete env.NOEMA_ALERT_5M_P95_MS;
  delete env.NOEMA_ALERT_RATE_LIMIT_MINUTES;
  delete env.NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER;
  return spawnSync(process.execPath, ["scripts/evaluate-observability-alerts.mjs", logPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
}

describe("observability alert input integrity", () => {
  it("rejects malformed UTF-8 before alert aggregation", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-observability-alert-"));
    try {
      const logPath = join(dir, "exchange.ndjson");
      const prefix = Buffer.from(
        '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"timestamp":"2026-08-01T00:00:00.000Z","note":"',
        "utf8",
      );
      const suffix = Buffer.from('"}\n', "utf8");
      writeFileSync(logPath, Buffer.concat([prefix, Buffer.from([0xff]), suffix]));

      const result = runAlerts(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid UTF-8 in observability log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves valid alert semantics and ignores non-JSON lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-observability-alert-"));
    try {
      const logPath = join(dir, "exchange.ndjson");
      writeFileSync(logPath, [
        "not-json",
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 120,
          timestamp: "2026-08-01T00:00:00.000Z",
        }),
        JSON.stringify({
          event: "http_request",
          route: "/health",
          status_code: 500,
          latency_ms: 999,
          timestamp: "2026-08-01T00:00:00.000Z",
        }),
        "",
      ].join("\n"));

      const result = runAlerts(logPath);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        total: 1,
        failures: 0,
        exchange_failure_rate: 0,
        exchange_p95_latency_ms: 120,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
