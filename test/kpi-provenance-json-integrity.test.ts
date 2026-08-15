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

function runStrictGate(logPath: string, provenancePath: string, evidencePath: string) {
  return spawnSync(process.execPath, ["scripts/kpi-gate.mjs", logPath], {
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
}

function validProvenanceJson(logPath: string) {
  const identity = logIdentity(logPath);
  return JSON.stringify({
    sourceKind: "production",
    sourceId: "cloudflare-logpush:noema-production",
    sourceMethod: "log-url",
    logPath,
    records: 2,
    collectedAt: "2026-07-02T00:00:00.000Z",
    ...identity,
  });
}

describe("strict KPI provenance JSON integrity", () => {
  it("rejects duplicate decoded provenance keys before last-key-wins parsing", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-provenance-integrity-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const evidencePath = join(dir, "evidence.json");
      writeThirtyDayExchangeLog(logPath);
      const { logSha256, logBytes } = logIdentity(logPath);
      writeFileSync(
        provenancePath,
        `{"sourceKind":"staging","sourceK\\u0069nd":"production","sourceId":"cloudflare-logpush:noema-production","sourceMethod":"log-url","logPath":${JSON.stringify(logPath)},"records":2,"collectedAt":"2026-07-02T00:00:00.000Z","logSha256":"${logSha256}","logBytes":${logBytes}}`,
      );

      const result = runStrictGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("duplicate decoded JSON object keys");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed UTF-8 provenance bytes instead of replacement-decoding them", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-provenance-integrity-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const evidencePath = join(dir, "evidence.json");
      writeThirtyDayExchangeLog(logPath);
      const text = validProvenanceJson(logPath);
      const bytes = Buffer.from(text, "utf8");
      const marker = Buffer.from("log-url", "utf8");
      const markerOffset = bytes.indexOf(marker);
      expect(markerOffset).toBeGreaterThanOrEqual(0);
      bytes[markerOffset] = 0x80;
      writeFileSync(provenancePath, bytes);

      const result = runStrictGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("not valid UTF-8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});