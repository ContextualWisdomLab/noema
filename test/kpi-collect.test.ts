import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ndjsonCommand = `printf '%s\\n' '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"timestamp":"2026-06-01T00:00:00.000Z"}'`;
const bashBin = process.platform === "win32" && existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";

function toBashPath(path: string): string {
  if (process.platform !== "win32") return path;
  return path.replace(/^([A-Za-z]):\\/, (_, drive: string) => `/${drive.toLowerCase()}/`).replace(/\\/g, "/");
}

function runCollect(env: NodeJS.ProcessEnv) {
  return spawnSync(bashBin, ["scripts/collect-kpi-logs.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

describe("kpi log collection provenance", () => {
  it("requires production source metadata before collection", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collect-"));
    try {
      const result = runCollect({
        NOEMA_KPI_TAIL_COMMAND: ndjsonCommand,
        NOEMA_KPI_LOG_PATH: toBashPath(join(dir, "exchange-30d.ndjson")),
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("NOEMA_KPI_SOURCE_KIND=production is required");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe source ids before collection", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collect-"));
    try {
      const result = runCollect({
        NOEMA_KPI_TAIL_COMMAND: ndjsonCommand,
        NOEMA_KPI_LOG_PATH: toBashPath(join(dir, "exchange-30d.ndjson")),
        NOEMA_KPI_SOURCE_KIND: "production",
        NOEMA_KPI_SOURCE_ID: "https://logs.example.com/export?token=secret",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("NOEMA_KPI_SOURCE_ID must be a stable non-secret label");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects placeholder source ids before collection", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collect-"));
    try {
      const result = runCollect({
        NOEMA_KPI_TAIL_COMMAND: ndjsonCommand,
        NOEMA_KPI_LOG_PATH: toBashPath(join(dir, "exchange-30d.ndjson")),
        NOEMA_KPI_SOURCE_KIND: "production",
        NOEMA_KPI_SOURCE_ID: "replace-with-log-source",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("NOEMA_KPI_SOURCE_ID must be a stable non-secret label");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes production provenance for safe source labels", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collect-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const result = runCollect({
        NOEMA_KPI_TAIL_COMMAND: ndjsonCommand,
        NOEMA_KPI_LOG_PATH: toBashPath(logPath),
        NOEMA_KPI_PROVENANCE_PATH: toBashPath(provenancePath),
        NOEMA_KPI_SOURCE_KIND: "production",
        NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:hockey-production",
      });

      expect(result.status).toBe(0);
      expect(existsSync(logPath)).toBe(true);
      const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
      expect(provenance.sourceKind).toBe("production");
      expect(provenance.sourceId).toBe("cloudflare-logpush:hockey-production");
      expect(provenance.records).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
