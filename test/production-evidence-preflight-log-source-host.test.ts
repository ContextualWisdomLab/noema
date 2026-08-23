import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runPreflight(logUrl: string) {
  return spawnSync(process.execPath, ["scripts/production-evidence-preflight.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_EXCHANGE_URL: "https://noema.acme-corp.com/exchange",
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      NOEMA_KPI_LOG_URL: logUrl,
      NOEMA_KPI_TAIL_COMMAND: "",
    },
    encoding: "utf8",
  });
}

describe("production KPI log source host", () => {
  it.each([
    "https://localhost/exchange-30d.ndjson",
    "https://127.0.0.1/exchange-30d.ndjson",
    "https://logs.example.com/exchange-30d.ndjson",
    "https://198.18.0.1/exchange-30d.ndjson",
    "https://[2001:db8::1]/exchange-30d.ndjson",
    "https://[2001:2::1]/exchange-30d.ndjson",
    "https://[3fff::1]/exchange-30d.ndjson",
  ])("rejects local, benchmark, or documentation-only KPI log source %s", (logUrl) => {
    const result = runPreflight(logUrl);
    const output = JSON.parse(result.stdout);
    const sourceInput = output.checks.find(
      (check: { name: string }) => check.name === "NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND",
    );

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(sourceInput.status).toBe("FAIL");
  });

  it.each([
    "https://collector:secret@logs.acme-corp.com/exchange-30d.ndjson",
    "https://collector@logs.acme-corp.com/exchange-30d.ndjson",
  ])("rejects credential-bearing KPI log source %s", (logUrl) => {
    const result = runPreflight(logUrl);
    const output = JSON.parse(result.stdout);
    const sourceInput = output.checks.find(
      (check: { name: string }) => check.name === "NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND",
    );

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(sourceInput.status).toBe("FAIL");
  });

  it.each([
    "https://logs.acme-corp.com/exchange-30d.ndjson",
    "https://10.0.0.5/exchange-30d.ndjson",
  ])("preserves legitimate production KPI log source %s", (logUrl) => {
    const result = runPreflight(logUrl);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.passed).toBe(true);
  });
});
