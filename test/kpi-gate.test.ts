import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function writeThirtyDayExchangeLog(path: string) {
  const start = Date.parse("2026-06-01T00:00:00.000Z");
  const end = Date.parse("2026-07-01T03:00:00.000Z");
  const records = [
    {
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 120,
      timestamp: new Date(start).toISOString(),
    },
    {
      event: "http_request",
      route: "/exchange",
      status_code: 200,
      latency_ms: 157,
      timestamp: new Date(end).toISOString(),
    },
  ];

  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function runKpiGate(logPath: string, provenancePath: string, evidencePath: string) {
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

describe("kpi-gate strict provenance", () => {
  it("fails strict mode when a valid KPI log has no production provenance", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Missing KPI provenance file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes strict mode with a valid production provenance file", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify({
        sourceKind: "production",
        sourceId: "cloudflare-logpush:hockey-production",
        sourceMethod: "log-url",
        logPath,
        records: 2,
        collectedAt: "2026-07-02T00:00:00.000Z",
      }, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("\"status\": \"PASS\"");
      expect(result.stdout).toContain("\"provenancePath\"");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows non-secret provenance labels that contain key as part of another word", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify({
        sourceKind: "production",
        sourceId: "cloudflare-logpush:hockey-production",
        sourceMethod: "log-url",
        logPath,
        records: 2,
        collectedAt: "2026-07-02T00:00:00.000Z",
      }, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("\"status\": \"PASS\"");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects secret-like production provenance source ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify({
        sourceKind: "production",
        sourceId: "https://logs.example.com/exchange-30d.ndjson?token=secret",
        sourceMethod: "log-url",
        logPath,
        records: 2,
        collectedAt: "2026-07-02T00:00:00.000Z",
      }, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("sourceId must be a stable non-secret label");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects placeholder production provenance source ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify({
        sourceKind: "production",
        sourceId: "replace-with-log-source",
        sourceMethod: "log-url",
        logPath,
        records: 2,
        collectedAt: "2026-07-02T00:00:00.000Z",
      }, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("sourceId must be a stable non-secret label");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
