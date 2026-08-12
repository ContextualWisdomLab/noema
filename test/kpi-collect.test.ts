import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ndjsonCommand = `printf '%s\\n' '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"timestamp":"2026-06-01T00:00:00.000Z"}'`;
const unterminatedNdjsonCommand = `printf '%s' '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"timestamp":"2026-06-01T00:00:00.000Z"}'`;
const bashBin = process.platform === "win32" && existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";
const bashProbe = spawnSync(bashBin, ["--version"], { encoding: "utf8", timeout: 2000 });
const describeWithUsableBash = bashProbe.status === 0 ? describe : describe.skip;
const itWithPosixCurlShim = process.platform === "win32" ? it.skip : it;

function toBashPath(path: string): string {
  if (process.platform !== "win32") return path;
  return path.replace(/^([A-Za-z]):\\/, (_, drive: string) => `/${drive.toLowerCase()}/`).replace(/\\/g, "/");
}

function runCollect(env: NodeJS.ProcessEnv) {
  return spawnSync(bashBin, ["scripts/collect-kpi-logs.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 8000,
    env: {
      ...process.env,
      ...env,
    },
  });
}

function installSyntheticHttpErrorCurl(dir: string): string {
  const binDir = join(dir, "bin");
  mkdirSync(binDir);
  const curlPath = join(binDir, "curl");
  writeFileSync(curlPath, `#!/usr/bin/env bash
set -euo pipefail
has_fail=0
has_https_protocol=0
output=""
previous=""
for argument in "$@"; do
  if [[ "$argument" == "--fail" || "$argument" == "--fail-with-body" ]]; then
    has_fail=1
  fi
  if [[ "$previous" == "--proto" && "$argument" == "=https" ]]; then
    has_https_protocol=1
  fi
  if [[ "$previous" == "-o" || "$previous" == "--output" ]]; then
    output="$argument"
  fi
  previous="$argument"
done
if [[ "$has_fail" -eq 1 && "$has_https_protocol" -eq 1 ]]; then
  exit 22
fi
if [[ -n "$output" ]]; then
  printf '%s\\n' '{"error":"synthetic upstream 404"}' > "$output"
fi
exit 0
`);
  chmodSync(curlPath, 0o755);
  return binDir;
}

describeWithUsableBash("kpi log collection provenance", () => {
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

  it("rejects non-HTTPS KPI log URL schemes before retaining bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collect-"));
    try {
      const sourcePath = join(dir, "source.ndjson");
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeFileSync(sourcePath, `${ndjsonCommand}\n`);

      const result = runCollect({
        NOEMA_KPI_LOG_URL: pathToFileURL(sourcePath).href,
        NOEMA_KPI_LOG_PATH: toBashPath(logPath),
        NOEMA_KPI_PROVENANCE_PATH: toBashPath(provenancePath),
        NOEMA_KPI_SOURCE_KIND: "production",
        NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:hockey-production",
      });

      expect(result.status).toBe(1);
      expect(existsSync(logPath)).toBe(false);
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);

  itWithPosixCurlShim("requires HTTPS-only curl policy and HTTP failure semantics before retaining URL bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collect-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const binDir = installSyntheticHttpErrorCurl(dir);
      const result = runCollect({
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        NOEMA_KPI_LOG_URL: "https://logs.example.invalid/exchange-30d.ndjson",
        NOEMA_KPI_LOG_PATH: toBashPath(logPath),
        NOEMA_KPI_PROVENANCE_PATH: toBashPath(provenancePath),
        NOEMA_KPI_SOURCE_KIND: "production",
        NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:hockey-production",
      });

      expect(result.status).toBe(1);
      expect(existsSync(logPath)).toBe(false);
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);

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
      const logBytes = readFileSync(logPath);
      const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
      expect(provenance.sourceKind).toBe("production");
      expect(provenance.sourceId).toBe("cloudflare-logpush:hockey-production");
      expect(provenance.records).toBe(1);
      expect(provenance.logBytes).toBe(logBytes.byteLength);
      expect(provenance.logSha256).toBe(createHash("sha256").update(logBytes).digest("hex"));
      expect(provenance.logSha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);

  it("counts a final unterminated NDJSON record in the same provenance identity", () => {
    const dir = mkdtempSync(join(tmpdir(), "noema-kpi-collect-"));
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      const result = runCollect({
        NOEMA_KPI_TAIL_COMMAND: unterminatedNdjsonCommand,
        NOEMA_KPI_LOG_PATH: toBashPath(logPath),
        NOEMA_KPI_PROVENANCE_PATH: toBashPath(provenancePath),
        NOEMA_KPI_SOURCE_KIND: "production",
        NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:hockey-production",
      });

      expect(result.status).toBe(0);
      const logBytes = readFileSync(logPath);
      const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
      expect(provenance.records).toBe(1);
      expect(provenance.logBytes).toBe(logBytes.byteLength);
      expect(provenance.logSha256).toBe(createHash("sha256").update(logBytes).digest("hex"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);
});
