import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const bashBin = process.platform === "win32" && existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";
const bashProbe = spawnSync(bashBin, ["--version"], { encoding: "utf8", timeout: 2000 });
const describeWithUsablePosixBash = bashProbe.status === 0 && process.platform !== "win32"
  ? describe
  : describe.skip;

function installSuccessfulCurlShim(dir: string): { binDir: string; markerPath: string } {
  const binDir = join(dir, "bin");
  const markerPath = join(dir, "curl-called");
  mkdirSync(binDir);
  const curlPath = join(binDir, "curl");
  writeFileSync(curlPath, `#!/usr/bin/env bash
set -euo pipefail
output=""
previous=""
for argument in "$@"; do
  if [[ "$previous" == "-o" || "$previous" == "--output" ]]; then
    output="$argument"
  fi
  previous="$argument"
done
printf 'called' > "${markerPath}"
printf '%s\\n' '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"timestamp":"2026-06-01T00:00:00.000Z"}' > "$output"
`);
  chmodSync(curlPath, 0o755);
  return { binDir, markerPath };
}

function runCollector(dir: string, logUrl: string, tailCommand = "") {
  const { binDir, markerPath } = installSuccessfulCurlShim(dir);
  const logPath = join(dir, "exchange-30d.ndjson");
  const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
  const result = spawnSync(bashBin, ["scripts/collect-kpi-logs.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 8000,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      NOEMA_KPI_LOG_URL: logUrl,
      NOEMA_KPI_LOG_PATH: logPath,
      NOEMA_KPI_PROVENANCE_PATH: provenancePath,
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      NOEMA_KPI_TAIL_COMMAND: tailCommand,
    },
  });
  return { result, markerPath, logPath, provenancePath };
}

describeWithUsablePosixBash("KPI collector production URL authority", () => {
  it.each([
    "https://localhost/exchange-30d.ndjson",
    "https://logs.example.com/exchange-30d.ndjson",
    "https://198.18.0.1/exchange-30d.ndjson",
    "https://[fec0::1]/exchange-30d.ndjson",
  ])("rejects non-production log host before invoking curl: %s", (logUrl) => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-url-authority-"));
    try {
      const { result, markerPath, logPath, provenancePath } = runCollector(dir, logUrl);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("NOEMA_KPI_LOG_URL must use a production host");
      expect(existsSync(markerPath)).toBe(false);
      expect(existsSync(logPath)).toBe(false);
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    "https://collector:secret@logs.acme-corp.com/exchange-30d.ndjson",
    "https://collector@logs.acme-corp.com/exchange-30d.ndjson",
    "https://logs.acme-corp.com/exchange-30d.ndjson?token=secret",
    "https://logs.acme-corp.com/exchange-30d.ndjson?X-Amz-Signature=abc123",
    "https://logs.acme-corp.com/exchange-30d.ndjson#access_token=secret",
  ])("rejects credential-bearing log URL before invoking curl: %s", (logUrl) => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-url-authority-"));
    try {
      const { result, markerPath, logPath, provenancePath } = runCollector(dir, logUrl);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("NOEMA_KPI_LOG_URL must not embed credentials");
      expect(existsSync(markerPath)).toBe(false);
      expect(existsSync(logPath)).toBe(false);
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    "https://10.20.30.40/exchange-30d.ndjson",
    "https://10.20.30.40/export?start=2026-07-01T00%3A00%3A00Z&end=2026-08-01T00%3A00%3A00Z",
    "https://[fd12:3456::10]/exchange-30d.ndjson",
  ])("retains legitimate private-enterprise log host support: %s", (logUrl) => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-url-authority-"));
    try {
      const { result, markerPath, logPath, provenancePath } = runCollector(dir, logUrl);

      expect(result.status).toBe(0);
      expect(existsSync(markerPath)).toBe(true);
      expect(existsSync(logPath)).toBe(true);
      expect(existsSync(provenancePath)).toBe(true);
      const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
      expect(provenance.sourceKind).toBe("production");
      expect(provenance.sourceMethod).toBe("log-url");
      expect(provenance.records).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects simultaneous URL and tail-command authority before collection", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-url-authority-"));
    try {
      const { result, markerPath, logPath, provenancePath } = runCollector(
        dir,
        "https://10.20.30.40/exchange-30d.ndjson",
        "printf '%s\\n' '{}';",
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Set exactly one of NOEMA_KPI_LOG_URL or NOEMA_KPI_TAIL_COMMAND");
      expect(existsSync(markerPath)).toBe(false);
      expect(existsSync(logPath)).toBe(false);
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
