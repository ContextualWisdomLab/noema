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
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function logIdentity(path: string) {
  const bytes = readFileSync(path);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

function runStrictGate(collectedAt: string) {
  const dir = mkdtempSync(join(tmpdir(), "noema-kpi-provenance-time-"));
  const logPath = join(dir, "exchange-30d.ndjson");
  const provenancePath = `${logPath}.provenance.json`;
  const evidencePath = join(dir, "evidence.json");
  writeThirtyDayExchangeLog(logPath);
  writeFileSync(provenancePath, JSON.stringify({
    sourceKind: "production",
    sourceId: "cloudflare-logpush:noema-production",
    sourceMethod: "log-url",
    logPath,
    records: 2,
    collectedAt,
    ...logIdentity(logPath),
  }, null, 2));

  const result = spawnSync(process.execPath, ["scripts/kpi-gate.mjs", logPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NOEMA_KPI_STRICT: "1",
      NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
      NOEMA_KPI_PROVENANCE_PATH: provenancePath,
      NOEMA_KPI_EVIDENCE_PATH: evidencePath,
    },
  });
  return { dir, result };
}

describe("strict KPI provenance timestamp integrity", () => {
  for (const collectedAt of ["08/21/2026", "2026-02-30", "2026-08-21 12:00:00"]) {
    it(`rejects non-canonical collectedAt ${collectedAt}`, () => {
      const { dir, result } = runStrictGate(collectedAt);
      try {
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "KPI provenance collectedAt must be an ISO timestamp in strict mode.",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
