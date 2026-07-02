import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runPreflight(env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["scripts/production-evidence-preflight.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: "utf8",
  });
}

describe("production-evidence-preflight", () => {
  it("fails closed when production evidence inputs are missing", () => {
    const result = runPreflight();
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(output.checks.map((check: { name: string }) => check.name)).toContain("NOEMA_EXCHANGE_URL");
    expect(output.checks.map((check: { name: string }) => check.name)).toContain("NOEMA_KPI_SOURCE_ID");
    expect(output.checks.map((check: { name: string }) => check.name)).toContain("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND");
  });

  it("passes when production smoke and KPI collection inputs are present", () => {
    const result = runPreflight({
      NOEMA_EXCHANGE_URL: "https://noema.example.com/exchange",
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      NOEMA_KPI_LOG_URL: "https://logs.example.com/exchange-30d.ndjson",
    });
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.passed).toBe(true);
  });
});
