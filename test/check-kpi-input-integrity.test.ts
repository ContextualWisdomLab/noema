import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runCheckKpi(logPath: string, requireWindowDays?: string) {
  const env = { ...process.env };
  if (requireWindowDays === undefined) {
    delete env.NOEMA_KPI_REQUIRE_WINDOW_DAYS;
  } else {
    env.NOEMA_KPI_REQUIRE_WINDOW_DAYS = requireWindowDays;
  }
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

  it("rejects duplicate decoded JSON keys before KPI calculation", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(
        logPath,
        '{"event":"http_request","route":"/health","r\\u006fute":"/exchange","status_code":500,"st\\u0061tus_code":200,"latency_ms":120}\n',
      );

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Duplicate decoded JSON key in KPI log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON-looking lines instead of silently dropping threshold evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(
        logPath,
        '{"event":"http_request","route":"/exchange","status_code":500,"latency_ms":120\n',
      );

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Malformed JSON in KPI log line 1");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an impossible calendar timestamp instead of normalizing it into window evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-time-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, [
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 120,
          timestamp: "2026-02-01T00:00:00.000Z",
        }),
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 140,
          timestamp: "2026-02-30",
        }),
        "",
      ].join("\n"));

      const result = runCheckKpi(logPath, "28");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid exchange timestamp in KPI log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects negative latency instead of letting corrupt evidence lower p95", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-latency-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, `${JSON.stringify({
        event: "http_request",
        route: "/exchange",
        status_code: 200,
        latency_ms: -1,
      })}\n`);

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid exchange latency in KPI log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects string latency instead of coercing untyped evidence into p95", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-latency-type-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, `${JSON.stringify({
        event: "http_request",
        route: "/exchange",
        status_code: 200,
        latency_ms: "0",
      })}\n`);

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid exchange latency in KPI log");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves a zero-millisecond latency as a real KPI sample", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-zero-latency-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, `${JSON.stringify({
        event: "http_request",
        route: "/exchange",
        status_code: 200,
        latency_ms: 0,
      })}\n`);

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        exchange_requests: 1,
        exchange_failures: 0,
        exchange_p95_latency_ms: 0,
        pass: true,
      });
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
