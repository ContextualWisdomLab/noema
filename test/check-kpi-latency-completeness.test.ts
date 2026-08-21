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

describe("KPI latency evidence completeness", () => {
  it("rejects a canonical exchange event that omits latency instead of shrinking the p95 sample", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-check-kpi-latency-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      writeFileSync(logPath, [
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
          latency_ms: 10,
        }),
        JSON.stringify({
          event: "http_request",
          route: "/exchange",
          status_code: 200,
        }),
        "",
      ].join("\n"));

      const result = runCheckKpi(logPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("exchange latency is required");
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
