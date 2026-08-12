import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runComputeKpi(logPath: string) {
  return spawnSync(process.execPath, ["scripts/compute-kpi.mjs", logPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("direct KPI computation input integrity", () => {
  it("rejects malformed UTF-8 before computing exchange metrics", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const prefix = Buffer.from(
        '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":123,"note":"',
        "utf8",
      );
      const suffix = Buffer.from('"}\n', "utf8");
      writeFileSync(logPath, Buffer.concat([prefix, Buffer.from([0xff]), suffix]));

      const result = runComputeKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid UTF-8 in KPI log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves valid UTF-8 metrics and ignores non-JSON lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
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
          request: { url: "https://noema.example/exchange?probe=1" },
          status_code: 500,
          latency_ms: 200,
        }),
        JSON.stringify({
          event: "http_request",
          route: "/health",
          status_code: 200,
          latency_ms: 1,
        }),
        "",
      ].join("\n"));

      const result = runComputeKpi(logPath);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        exchange_requests: 2,
        exchange_failures: 1,
        exchange_failure_rate: 0.5,
        exchange_p95_latency_ms: 200,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
