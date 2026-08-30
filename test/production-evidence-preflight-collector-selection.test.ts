import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runPreflight(env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["scripts/production-evidence-preflight.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_EXCHANGE_URL: "https://noema.acme-corp.com/exchange",
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      NOEMA_KPI_LOG_URL: "",
      NOEMA_KPI_TAIL_COMMAND: "",
      ...env,
    },
    encoding: "utf8",
  });
}

describe("production evidence collector selection", () => {
  it("rejects a whitespace-only log URL instead of silently selecting the tail-command path", () => {
    const result = runPreflight({
      NOEMA_KPI_LOG_URL: "   ",
      NOEMA_KPI_TAIL_COMMAND: "collector --emit-ndjson",
    });
    const output = JSON.parse(result.stdout);
    const sourceInput = output.checks.find(
      (check: { name: string }) => check.name === "NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND",
    );

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(sourceInput.status).toBe("FAIL");
  });
});
