import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runPreflight(exchangeUrl: string) {
  return spawnSync(process.execPath, ["scripts/production-evidence-preflight.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_EXCHANGE_URL: exchangeUrl,
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      NOEMA_KPI_LOG_URL: "https://logs.example.com/exchange-30d.ndjson",
      NOEMA_KPI_TAIL_COMMAND: "",
    },
    encoding: "utf8",
  });
}

describe("production exchange benchmark-address rejection", () => {
  it.each([
    "https://198.18.0.1/exchange",
    "https://198.19.255.254/exchange",
    "https://[::ffff:c612:1]/exchange",
  ])("rejects RFC 2544 benchmark endpoint %s", (exchangeUrl) => {
    const result = runPreflight(exchangeUrl);
    const output = JSON.parse(result.stdout);
    const exchangeCheck = output.checks.find(
      (check: { name: string }) => check.name === "NOEMA_EXCHANGE_URL",
    );

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(exchangeCheck.status).toBe("FAIL");
  });
});
