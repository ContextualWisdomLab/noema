import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runPreflight(sourceId: string) {
  return spawnSync(process.execPath, ["scripts/production-evidence-preflight.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_EXCHANGE_URL: "https://noema.example.com/exchange",
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: sourceId,
      NOEMA_KPI_LOG_URL: "https://logs.example.com/exchange-30d.ndjson",
      NOEMA_KPI_TAIL_COMMAND: "",
    },
    encoding: "utf8",
  });
}

describe("production KPI source-id canonical identity", () => {
  it.each([
    " cloudflare-logpush:noema-production",
    "cloudflare-logpush:noema-production ",
  ])("rejects noncanonical preflight source identity %j", (sourceId) => {
    const result = runPreflight(sourceId);
    const output = JSON.parse(result.stdout);
    const sourceCheck = output.checks.find(
      (check: { name: string }) => check.name === "NOEMA_KPI_SOURCE_ID",
    );

    expect(result.status).toBe(1);
    expect(sourceCheck).toMatchObject({
      status: "FAIL",
      message: expect.stringContaining("canonical"),
    });
  });
});
