import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function runKpiGate(
  logPath: string,
  provenancePath: string,
  evidencePath: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync(process.execPath, ["scripts/kpi-gate.mjs", logPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      NOEMA_KPI_STRICT: "1",
      NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
      NOEMA_KPI_PROVENANCE_PATH: provenancePath,
      NOEMA_KPI_EVIDENCE_PATH: evidencePath,
    },
  });
}

function runKpiGateStrictCli(logPath: string, provenancePath: string, evidencePath: string) {
  return spawnSync(process.execPath, ["scripts/kpi-gate.mjs", "--strict", "--require-window-days", "30", logPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NOEMA_KPI_PROVENANCE_PATH: provenancePath,
      NOEMA_KPI_EVIDENCE_PATH: evidencePath,
    },
  });
}

function logIdentity(path: string) {
  const bytes = readFileSync(path);
  return {
    logSha256: createHash("sha256").update(bytes).digest("hex"),
    logBytes: bytes.byteLength,
  };
}

function productionProvenance(logPath: string, sourceId = "cloudflare-logpush:noema-production") {
  return {
    sourceKind: "production",
    sourceId,
    sourceMethod: "log-url",
    logPath,
    records: 2,
    collectedAt: "2026-07-02T00:00:00.000Z",
    ...logIdentity(logPath),
  };
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
      writeFileSync(provenancePath, JSON.stringify(
        productionProvenance(logPath, "cloudflare-logpush:hockey-production"),
        null,
        2,
      ));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("\"status\": \"PASS\"");
      expect(result.stdout).toContain("\"provenancePath\"");
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
      expect(evidence.provenance).toMatchObject(logIdentity(logPath));
      expect(evidence.steps).toContainEqual({
        name: "kpi-log-identity-final",
        status: "PASS",
        exitCode: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not forward ambient Node preload authority to KPI child processes", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const preloadPath = join(dir, "hostile-preload.cjs");
      const childMarkerPath = join(dir, "child-preload-observed.jsonl");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify(productionProvenance(logPath), null, 2));
      writeFileSync(preloadPath, `
const fs = require("node:fs");
const entry = process.argv[1] || "";
if (entry.endsWith("check-kpi.mjs") || entry.endsWith("evaluate-observability-alerts.mjs")) {
  fs.appendFileSync(process.env.NOEMA_KPI_CHILD_MARKER, JSON.stringify({
    entry,
    githubToken: process.env.GITHUB_TOKEN || null,
    nimKey: process.env.NVIDIA_NIM_API_KEY || null,
    home: process.env.HOME || null,
  }) + "\\n");
}
`);

      const result = runKpiGate(logPath, provenancePath, evidencePath, {
        NODE_OPTIONS: `--require=${preloadPath}`,
        NOEMA_KPI_CHILD_MARKER: childMarkerPath,
        GITHUB_TOKEN: "synthetic-github-token",
        NVIDIA_NIM_API_KEY: "synthetic-nim-key",
      });

      expect(result.status).toBe(0);
      expect(existsSync(childMarkerPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails strict mode when configured KPI evidence cannot be persisted", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence-directory");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify(productionProvenance(logPath), null, 2));
      mkdirSync(evidencePath);

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Failed to write KPI evidence file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects KPI log bytes changed after provenance was recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify(productionProvenance(logPath), null, 2));
      writeFileSync(logPath, `${readFileSync(logPath, "utf8")}${JSON.stringify({
        event: "http_request",
        route: "/exchange",
        status_code: 200,
        latency_ms: 130,
        timestamp: "2026-07-01T03:01:00.000Z",
      })}\n`);

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("KPI log identity does not match production provenance");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects strict provenance without exact log identity", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      const { logSha256: _logSha256, logBytes: _logBytes, ...withoutIdentity } = productionProvenance(logPath);
      writeFileSync(provenancePath, JSON.stringify(withoutIdentity, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("logSha256 must be a 64-character lowercase SHA-256 digest");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed strict provenance log identity", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify({
        ...productionProvenance(logPath),
        logSha256: "ABCDEF",
        logBytes: 0,
      }, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("logSha256 must be a 64-character lowercase SHA-256 digest");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts strict mode flags without POSIX env-prefix syntax", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const evidencePath = join(dir, "evidence.json");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeThirtyDayExchangeLog(logPath);
      writeFileSync(provenancePath, JSON.stringify(productionProvenance(logPath), null, 2));

      const result = runKpiGateStrictCli(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("\"status\": \"PASS\"");
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
      expect(evidence.strict).toBe(true);
      expect(evidence.requireWindowDays).toBe(30);
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
      writeFileSync(provenancePath, JSON.stringify(
        productionProvenance(logPath, "cloudflare-logpush:hockey-production"),
        null,
        2,
      ));

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
      writeFileSync(provenancePath, JSON.stringify(
        productionProvenance(logPath, "https://logs.example.com/exchange-30d.ndjson?token=secret"),
        null,
        2,
      ));

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
      writeFileSync(provenancePath, JSON.stringify(
        productionProvenance(logPath, "replace-with-log-source"),
        null,
        2,
      ));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("sourceId must be a stable non-secret label");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
