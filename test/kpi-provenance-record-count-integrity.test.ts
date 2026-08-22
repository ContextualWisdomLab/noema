import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function thirtyDayExchangeLog(includeWhitespaceOnlyLine = false) {
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
  ].map((record) => JSON.stringify(record));

  if (includeWhitespaceOnlyLine) {
    return `${records[0]}\n \t\r\n${records[1]}\n`;
  }
  return `${records.join("\n")}\n`;
}

function logIdentity(path: string) {
  const bytes = readFileSync(path);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

function runStrictGate(records: unknown, logContents = thirtyDayExchangeLog()) {
  const dir = mkdtempSync(join(tmpdir(), "noema-kpi-provenance-records-"));
  const logPath = join(dir, "exchange-30d.ndjson");
  const provenancePath = `${logPath}.provenance.json`;
  const evidencePath = join(dir, "evidence.json");
  writeFileSync(logPath, logContents);
  writeFileSync(provenancePath, JSON.stringify({
    sourceKind: "production",
    sourceId: "cloudflare-logpush:noema-production",
    sourceMethod: "log-url",
    logPath,
    records,
    collectedAt: new Date(Date.now() - 60_000).toISOString(),
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

describe("strict KPI provenance record-count integrity", () => {
  for (const records of ["2", 2.5]) {
    it(`rejects non-canonical records evidence ${JSON.stringify(records)}`, () => {
      const { dir, result } = runStrictGate(records);
      try {
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "KPI provenance records must be a positive number and a safe integer in strict mode.",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("rejects a canonical count that does not match the authenticated NDJSON", () => {
    const { dir, result } = runStrictGate(3);
    try {
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "KPI provenance records do not match the authenticated production log.",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not count whitespace-only NDJSON separators as production records", () => {
    const { dir, result } = runStrictGate(2, thirtyDayExchangeLog(true));
    try {
      expect(result.status, result.stderr || result.stdout).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a canonical positive safe-integer record count", () => {
    const { dir, result } = runStrictGate(2);
    try {
      expect(result.status, result.stderr || result.stdout).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});