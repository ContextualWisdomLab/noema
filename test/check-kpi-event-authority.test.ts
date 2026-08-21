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

function expectInvalidEventIdentity(record: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-event-"));
  try {
    const logPath = join(dir, "exchange-30d.ndjson");
    writeFileSync(logPath, `${JSON.stringify(record)}\n`);

    const result = runCheckKpi(logPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exchange record is missing canonical http_request event identity");
    expect(result.stdout).toBe("");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("KPI event authority", () => {
  it("rejects an exchange-shaped record that omits the canonical http_request event identity", () => {
    expectInvalidEventIdentity({
      route: "/exchange",
      status_code: 200,
      latency_ms: 10,
    });
  });

  it("rejects an empty event identity instead of treating it as a canonical http_request", () => {
    expectInvalidEventIdentity({
      event: "",
      route: "/exchange",
      status_code: 200,
      latency_ms: 10,
    });
  });

  it("continues to ignore explicitly non-http_request events on the exchange route", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-event-ignore-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, [
        JSON.stringify({
          event: "workflow_trust",
          route: "/exchange",
          status_code: 403,
          latency_ms: 1,
        }),
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 10,
        }),
        "",
      ].join("\n"));

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
