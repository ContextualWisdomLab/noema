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

describe("KPI window authority", () => {
  it("rejects future exchange timestamps instead of letting them inflate the observed window", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-future-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const now = Date.now();
      writeFileSync(logPath, [
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 100,
          timestamp: new Date(now - (31 * 86400000)).toISOString(),
        }),
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 110,
          timestamp: new Date(now + 3600000).toISOString(),
        }),
        "",
      ].join("\n"));

      const result = runCheckKpi(logPath, "30");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("timestamp cannot be in the future");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const configuredWindow of ["Infinity", "NaN"]) {
    it(`rejects explicit non-finite window requirement ${configuredWindow}`, () => {
      const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-window-config-"));
      try {
        const logPath = join(dir, "exchange-30d.ndjson");
        writeFileSync(logPath, `${JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 100,
        })}\n`);

        const result = runCheckKpi(logPath, configuredWindow);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("NOEMA_KPI_REQUIRE_WINDOW_DAYS must be a positive finite number");
        expect(result.stdout).toBe("");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
