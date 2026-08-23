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

  it("rejects duplicate decoded JSON keys before computing exchange metrics", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(
        logPath,
        '{"event":"http_request","route":"/health","r\\u006fute":"/exchange","status_code":500,"st\\u0061tus_code":200,"latency_ms":120}\n',
      );

      const result = runComputeKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Duplicate decoded JSON key in KPI log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON-looking lines instead of silently dropping KPI evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(
        logPath,
        '{"event":"http_request","route":"/exchange","status_code":500,"latency_ms":120\n',
      );

      const result = runComputeKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Malformed JSON in KPI log line 1");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires canonical http_request event identity for exchange evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, `${JSON.stringify({
        route: "/exchange",
        status_code: 200,
        latency_ms: 0,
      })}\n`);

      const result = runComputeKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("KPI exchange record is missing canonical http_request event identity");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical exchange HTTP status evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      for (const status_code of [99, 600, 200.5, "200"]) {
        writeFileSync(logPath, `${JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code,
          latency_ms: 1,
        })}\n`);

        const result = runComputeKpi(logPath);
        expect(result.status, `status=${String(status_code)}`).toBe(1);
        expect(result.stderr).toContain("Invalid exchange HTTP status in KPI log");
        expect(result.stdout).toBe("");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing, non-numeric, negative, and non-finite exchange latency evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const invalidLines = [
        JSON.stringify({ event: "http_request", route: "/exchange", status_code: 200 }),
        JSON.stringify({ event: "http_request", route: "/exchange", status_code: 200, latency_ms: "120" }),
        JSON.stringify({ event: "http_request", route: "/exchange", status_code: 200, latency_ms: -1 }),
        '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":1e400}',
      ];

      for (const line of invalidLines) {
        writeFileSync(logPath, `${line}\n`);
        const result = runComputeKpi(logPath);
        expect(result.status, line).toBe(1);
        expect(result.stderr).toContain("exchange latency");
        expect(result.stdout).toBe("");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves zero-millisecond exchange latency as a real p95 sample", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-compute-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, `${JSON.stringify({
        event: "http_request",
        route: "/exchange",
        status_code: 200,
        latency_ms: 0,
      })}\n`);

      const result = runComputeKpi(logPath);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        exchange_requests: 1,
        exchange_failures: 0,
        exchange_failure_rate: 0,
        exchange_p95_latency_ms: 0,
      });
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
