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

describe("production exchange IPv6 special-purpose address rejection", () => {
  it.each([
    "https://[2001:2::1]/exchange",
    "https://[2001:2:0:ffff::1]/exchange",
    "https://[3fff::1]/exchange",
    "https://[3fff:abc::1]/exchange",
    "https://[fec0::1]/exchange",
    "https://[feff::1]/exchange",
  ])("rejects non-production IPv6 special-purpose endpoint %s", (exchangeUrl) => {
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
