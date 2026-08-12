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

describe("KPI threshold input integrity", () => {
  it("rejects malformed UTF-8 before calculating threshold metrics", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const prefix = Buffer.from(
        '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"note":"',
        "utf8",
      );
      const suffix = Buffer.from('"}\n', "utf8");
      writeFileSync(logPath, Buffer.concat([prefix, Buffer.from([0xff]), suffix]));

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid UTF-8 in KPI log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves valid threshold semantics and ignores non-JSON lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, [
        "not-json",
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 120,
        }),
        JSON.stringify({
          event: "http_request",
          request: { path: "/health" },
          status_code: 500,
          latency_ms: 999,
        }),
        "",
      ].join("\n"));

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        exchange_requests: 1,
        exchange_failures: 0,
        exchange_failure_rate: 0,
        exchange_p95_latency_ms: 120,
        pass: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
