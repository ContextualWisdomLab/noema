import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

function productionProvenance(logPath: string) {
  return {
    sourceKind: "production",
    sourceId: "cloudflare-logpush:noema-production",
    sourceMethod: "log-url",
    logPath,
    records: 2,
    collectedAt: "2026-07-02T00:00:00.000Z",
    ...logIdentity(logPath),
  };
}

function runKpiGate(
  logPath: string,
  provenancePath: string,
  evidencePath: string,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync(process.execPath, ["scripts/kpi-gate.mjs", logPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NOEMA_KPI_STRICT: "1",
      NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
      NOEMA_KPI_PROVENANCE_PATH: provenancePath,
      NOEMA_KPI_EVIDENCE_PATH: evidencePath,
      ...extraEnv,
    },
  });
}

describe("strict KPI provenance snapshot integrity", () => {
  it("uses verified immutable input bytes while the original log is replaced and restored during child checks", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-snapshot-test-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const evidencePath = join(dir, "evidence.json");
      const preloadPath = join(dir, "replace-original-during-kpi-child.mjs");
      writeThirtyDayExchangeLog(logPath);
      const provenance = productionProvenance(logPath);
      writeFileSync(provenancePath, JSON.stringify(provenance, null, 2));
      writeFileSync(preloadPath, `
import { readFileSync, writeFileSync } from "node:fs";
const childEntrypoint = process.argv[1] ?? "";
const originalLogPath = process.env.NOEMA_TEST_KPI_ORIGINAL_LOG ?? "";
if (
  originalLogPath &&
  (childEntrypoint.endsWith("scripts/check-kpi.mjs") ||
    childEntrypoint.endsWith("scripts/evaluate-observability-alerts.mjs"))
) {
  const originalBytes = readFileSync(originalLogPath);
  writeFileSync(originalLogPath, JSON.stringify({
    event: "http_request",
    route: "/exchange",
    status_code: 500,
    latency_ms: 9999,
    timestamp: "2026-06-15T00:00:00.000Z"
  }) + "\\n");
  process.once("exit", () => writeFileSync(originalLogPath, originalBytes));
}
`);

      const result = runKpiGate(logPath, provenancePath, evidencePath, {
        NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
        NOEMA_TEST_KPI_ORIGINAL_LOG: logPath,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("\"status\": \"PASS\"");
      expect(logIdentity(logPath)).toEqual({
        logSha256: provenance.logSha256,
        logBytes: provenance.logBytes,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects %s strict provenance logBytes independently", (_label, logBytes) => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-logbytes-test-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const evidencePath = join(dir, "evidence.json");
      writeThirtyDayExchangeLog(logPath);
      const provenance: Record<string, unknown> = productionProvenance(logPath);
      if (logBytes === undefined) {
        delete provenance.logBytes;
      } else {
        provenance.logBytes = logBytes;
      }
      writeFileSync(provenancePath, JSON.stringify(provenance, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("KPI provenance logBytes must be a positive safe integer in strict mode.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a valid positive logBytes value that does not match the retained log", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-logbytes-mismatch-test-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const evidencePath = join(dir, "evidence.json");
      writeThirtyDayExchangeLog(logPath);
      const provenance = productionProvenance(logPath);
      provenance.logBytes += 1;
      writeFileSync(provenancePath, JSON.stringify(provenance, null, 2));

      const result = runKpiGate(logPath, provenancePath, evidencePath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("KPI log identity does not match production provenance.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
