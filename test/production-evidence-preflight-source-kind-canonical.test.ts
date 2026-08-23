import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

function runPreflight(sourceKind: string) {
  return spawnSync(process.execPath, ["scripts/production-evidence-preflight.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NOEMA_EXCHANGE_URL: "https://noema.example/exchange",
      NOEMA_KPI_SOURCE_KIND: sourceKind,
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      NOEMA_KPI_LOG_URL: "https://logs.example/exchange-30d.ndjson",
      NOEMA_KPI_TAIL_COMMAND: "",
    },
  });
}

describe("production evidence preflight source kind identity", () => {
  it.each([" production", "production "])(
    "rejects whitespace-normalized production source kind %j",
    (sourceKind) => {
      const result = runPreflight(sourceKind);
      const output = JSON.parse(result.stdout) as {
        passed: boolean;
        checks: Array<{ name: string; status: string; message: string }>;
      };

      expect(result.status).toBe(1);
      expect(output.passed).toBe(false);
      expect(output.checks).toContainEqual({
        name: "NOEMA_KPI_SOURCE_KIND",
        status: "FAIL",
        message: 'Use the exact canonical value "production" without surrounding whitespace.',
      });
    },
  );
});
