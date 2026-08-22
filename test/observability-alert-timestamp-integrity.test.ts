import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runWithTimestamp(timestamp: string) {
  const dir = mkdtempSync(join(tmpdir(), "noema-observability-time-"));
  const logPath = join(dir, "exchange.ndjson");
  writeFileSync(
    logPath,
    `${JSON.stringify({
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 10,
      timestamp,
    })}\n`,
  );
  const env = { ...process.env };
  delete env.NOEMA_ALERT_5M_FAILURE_RATE;
  delete env.NOEMA_ALERT_5M_P95_MS;
  delete env.NOEMA_ALERT_RATE_LIMIT_MINUTES;
  delete env.NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER;
  try {
    return spawnSync(process.execPath, ["scripts/evaluate-observability-alerts.mjs", logPath], {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("observability timestamp authority", () => {
  it.each([
    ["future", "2999-08-22T13:00:00.000Z"],
    ["malformed", "not-a-timestamp"],
  ])("rejects an explicitly supplied %s event timestamp instead of manufacturing a synthetic window", (_label, timestamp) => {
    const result = runWithTimestamp(timestamp);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid timestamp in observability log line 1");
    expect(result.stdout).toBe("");
  });
});
