import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const bashBin = process.platform === "win32" && existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";
const bashProbe = spawnSync(bashBin, ["--version"], { encoding: "utf8", timeout: 2000 });
const describeWithUsableBash = bashProbe.status === 0 ? describe : describe.skip;
const logCommand = `printf '%s\\n' '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"timestamp":"2026-06-01T00:00:00.000Z"}' '   ' '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":157,"timestamp":"2026-07-01T03:00:00.000Z"}'`;

function toBashPath(path: string): string {
  if (process.platform !== "win32") return path;
  return path.replace(/^([A-Za-z]):\\/, (_, drive: string) => `/${drive.toLowerCase()}/`).replace(/\\/g, "/");
}

describeWithUsableBash("KPI collector record-count integrity", () => {
  it("does not manufacture a production record from a whitespace-only NDJSON line", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collector-records-"));
    const logPath = join(dir, "exchange-30d.ndjson");
    const provenancePath = `${logPath}.provenance.json`;

    try {
      const result = spawnSync(bashBin, ["scripts/collect-kpi-logs.sh"], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 8000,
        env: {
          ...process.env,
          NOEMA_KPI_TAIL_COMMAND: logCommand,
          NOEMA_KPI_LOG_PATH: toBashPath(logPath),
          NOEMA_KPI_PROVENANCE_PATH: toBashPath(provenancePath),
          NOEMA_KPI_SOURCE_KIND: "production",
          NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
        },
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
      expect(provenance.records).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);
});
