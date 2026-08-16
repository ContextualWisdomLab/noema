import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function writeThirtyDayExchangeLog(path: string) {
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
      latency_ms: 157,
      timestamp: "2026-07-01T03:00:00.000Z",
    },
  ];
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

function productionProvenance(logPath: string) {
  const bytes = readFileSync(logPath);
  return {
    sourceKind: "production",
    sourceId: "cloudflare-logpush:noema-production",
    sourceMethod: "log-url",
    logPath,
    records: 2,
    collectedAt: "2026-07-02T00:00:00.000Z",
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

describe("strict KPI window validation", () => {
  it.each(["not-a-number", "Infinity", "-Infinity"])(
    "rejects a non-finite strict window before KPI child checks: %s",
    (invalidWindow) => {
      const directory = mkdtempSync(join(tmpdir(), "noema-kpi-window-"));
      try {
        const logPath = join(directory, "exchange-30d.ndjson");
        const provenancePath = `${logPath}.provenance.json`;
        const evidencePath = join(directory, "evidence.json");
        writeThirtyDayExchangeLog(logPath);
        writeFileSync(provenancePath, JSON.stringify(productionProvenance(logPath), null, 2), "utf8");

        const result = spawnSync(process.execPath, ["scripts/kpi-gate.mjs", "--strict", logPath], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            NOEMA_KPI_REQUIRE_WINDOW_DAYS: invalidWindow,
            NOEMA_KPI_PROVENANCE_PATH: provenancePath,
            NOEMA_KPI_EVIDENCE_PATH: evidencePath,
          },
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          "NOEMA_KPI_REQUIRE_WINDOW_DAYS must be a positive finite number when strict KPI mode is enabled.",
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
