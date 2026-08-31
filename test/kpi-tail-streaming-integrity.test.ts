import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const collectorPath = join(repositoryRoot, "scripts", "collect-kpi-logs.sh");
const bashBin = "bash";
const bashProbe = spawnSync(bashBin, ["--version"], { encoding: "utf8", timeout: 2000 });
const describeWithUsablePosixBash = bashProbe.status === 0 && process.platform !== "win32"
  ? describe
  : describe.skip;

function temporaryDirectory() {
  return realpathSync(mkdtempSync(join(tmpdir(), "noema-kpi-tail-integrity-")));
}

function runCollector(
  logPath: string,
  provenancePath: string,
  tailCommand: string,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync(bashBin, [collectorPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      NOEMA_KPI_LOG_URL: "",
      NOEMA_KPI_TAIL_COMMAND: tailCommand,
      NOEMA_KPI_LOG_PATH: logPath,
      NOEMA_KPI_PROVENANCE_PATH: provenancePath,
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      ...extraEnv,
    },
  });
}

describeWithUsablePosixBash("KPI tail-command streaming integrity", () => {
  it("retries short writes until the complete streamed chunk is retained", () => {
    const dir = temporaryDirectory();
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = `${logPath}.provenance.json`;
      const preloadPath = join(dir, "inject-short-write.cjs");
      const record = '{"event":"http_request","route":"/exchange","status_code":200,"latency_ms":120,"timestamp":"2026-06-01T00:00:00.000Z"}';
      writeFileSync(
        preloadPath,
        `const fs = require("node:fs");\n`
          + `const { syncBuiltinESMExports } = require("node:module");\n`
          + `const originalOpenSync = fs.openSync;\n`
          + `const originalWriteSync = fs.writeSync;\n`
          + `let trackedDescriptor = null;\n`
          + `fs.openSync = function(path, flags, ...rest) {\n`
          + `  const descriptor = originalOpenSync.call(fs, path, flags, ...rest);\n`
          + `  if (path === process.env.NOEMA_KPI_LOG_PATH && typeof flags === "number"\n`
          + `    && (flags & fs.constants.O_WRONLY) !== 0) trackedDescriptor = descriptor;\n`
          + `  return descriptor;\n`
          + `};\n`
          + `fs.writeSync = function(descriptor, buffer, offset, length, position) {\n`
          + `  if (descriptor === trackedDescriptor && Buffer.isBuffer(buffer)) {\n`
          + `    const start = typeof offset === "number" ? offset : 0;\n`
          + `    const requested = typeof length === "number" ? length : buffer.length - start;\n`
          + `    const partial = Math.max(1, Math.min(requested, 7));\n`
          + `    return originalWriteSync.call(fs, descriptor, buffer, start, partial, position ?? null);\n`
          + `  }\n`
          + `  return originalWriteSync.apply(fs, arguments);\n`
          + `};\n`
          + `syncBuiltinESMExports();\n`,
      );

      const result = runCollector(logPath, provenancePath, `printf '%s\\n' '${record}'`, {
        NODE_OPTIONS: `--require=${preloadPath}`,
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const log = readFileSync(logPath);
      expect(log.toString("utf8")).toBe(`${record}\n`);
      const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
      expect(provenance.logBytes).toBe(log.byteLength);
      expect(provenance.logSha256).toBe(createHash("sha256").update(log).digest("hex"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("waits through TERM grace and reaps a SIGTERM-resistant timed-out command", () => {
    const dir = temporaryDirectory();
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = `${logPath}.provenance.json`;
      const preloadPath = join(dir, "accelerate-tail-deadline.cjs");
      writeFileSync(
        preloadPath,
        `const originalSetTimeout = global.setTimeout;\n`
          + `global.setTimeout = function(callback, delay, ...args) {\n`
          + `  if (delay === 600000) return originalSetTimeout(callback, 1500, ...args);\n`
          + `  if (delay === 1000) return originalSetTimeout(callback, 100, ...args);\n`
          + `  return originalSetTimeout(callback, delay, ...args);\n`
          + `};\n`,
      );
      const tailCommand = "trap '' TERM; while :; do sleep 1; done";

      const startedAt = Date.now();
      const result = runCollector(logPath, provenancePath, tailCommand, {
        NODE_OPTIONS: `--require=${preloadPath}`,
      });

      expect(result.status, result.stderr || result.stdout).toBe(1);
      expect(result.signal).toBeNull();
      expect(existsSync(provenancePath)).toBe(false);
      expect(result.stderr).toContain("600 second collection deadline");
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_500);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
