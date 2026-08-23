import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

function writeThirtyDayLog(path: string) {
  const records = [
    {
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 120,
      timestamp: "2026-06-01T00:00:00.000Z",
    },
    {
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 150,
      timestamp: "2026-07-01T03:00:00.000Z",
    },
  ];
  const bytes = Buffer.from(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  writeFileSync(path, bytes);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

describe("strict KPI provenance log path identity", () => {
  it("rejects provenance that claims a different logPath from the bytes being verified", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-log-path-identity-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = `${logPath}.provenance.json`;
      const evidencePath = join(directory, "evidence.json");
      const identity = writeThirtyDayLog(logPath);
      writeFileSync(
        provenancePath,
        `${JSON.stringify({
          sourceKind: "production",
          sourceId: "cloudflare-logpush:noema-production",
          sourceMethod: "log-url",
          logPath: join(directory, "different-production-log.ndjson"),
          records: 2,
          collectedAt: "2026-07-02T00:00:00.000Z",
          ...identity,
        }, null, 2)}\n`,
      );

      const result = spawnSync(
        process.execPath,
        ["scripts/kpi-gate.mjs", "--strict", "--require-window-days", "30", logPath],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            NOEMA_KPI_PROVENANCE_PATH: provenancePath,
            NOEMA_KPI_EVIDENCE_PATH: evidencePath,
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "KPI provenance logPath must exactly identify the production log being verified",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
