import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function logIdentity(path: string) {
  const bytes = readFileSync(path);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

describe("strict KPI provenance source identity", () => {
  it("rejects surrounding whitespace instead of silently normalizing the retained sourceId", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-source-id-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = `${logPath}.provenance.json`;
      writeThirtyDayLog(logPath);
      writeFileSync(provenancePath, JSON.stringify({
        sourceKind: "production",
        sourceId: " cloudflare-logpush:noema-production",
        sourceMethod: "log-url",
        logPath,
        records: 2,
        collectedAt: "2026-07-02T00:00:00.000Z",
        ...logIdentity(logPath),
      }, null, 2));

      const result = spawnSync(
        process.execPath,
        ["scripts/kpi-gate.mjs", "--strict", "--require-window-days", "30", logPath],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            NOEMA_KPI_PROVENANCE_PATH: provenancePath,
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("KPI provenance sourceId must be canonical without surrounding whitespace");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
