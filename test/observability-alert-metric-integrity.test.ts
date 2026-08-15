import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runAlerts(record: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "noema-observability-metric-"));
  const logPath = join(dir, "exchange.ndjson");
  writeFileSync(logPath, `${JSON.stringify(record)}\n`);

  const env = { ...process.env };
  delete env.NOEMA_ALERT_5M_FAILURE_RATE;
  delete env.NOEMA_ALERT_5M_P95_MS;
  delete env.NOEMA_ALERT_RATE_LIMIT_MINUTES;
  delete env.NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER;

  const result = spawnSync(process.execPath, ["scripts/evaluate-observability-alerts.mjs", logPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const baseRecord = {
  event: "http_request",
  route: "/exchange",
  status_code: 200,
  latency_ms: 120,
  timestamp: "2026-08-01T00:00:00.000Z",
};

describe("observability alert metric integrity", () => {
  it.each([-1, 99, 600, 700])("rejects impossible HTTP status %s before aggregation", (statusCode) => {
    const result = runAlerts({ ...baseRecord, status_code: statusCode });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid HTTP status in observability log line 1");
    expect(result.stdout).toBe("");
  });

  it.each([-1, "Infinity", "-Infinity", null, "", " "])(
    "rejects invalid explicitly supplied latency %s before aggregation",
    (latencyMs) => {
      const result = runAlerts({ ...baseRecord, latency_ms: latencyMs });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid latency in observability log line 1");
      expect(result.stdout).toBe("");
    },
  );

  it("preserves genuinely absent latency evidence", () => {
    const { latency_ms: _latency, ...withoutLatency } = baseRecord;
    const result = runAlerts(withoutLatency);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      total: 1,
      failures: 0,
      exchange_p95_latency_ms: null,
    });
  });

  it("preserves numeric-string metric compatibility", () => {
    const result = runAlerts({ ...baseRecord, status_code: "200", latency_ms: "120" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      total: 1,
      failures: 0,
      exchange_p95_latency_ms: 120,
    });
  });
});
