import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

function temporaryDirectory() {
  return realpathSync(mkdtempSync(join(tmpdir(), "noema-kpi-output-authority-")));
}

function runCollector(
  logPath: string,
  provenancePath: string,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync(bashBin, ["scripts/collect-kpi-logs.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      NOEMA_KPI_LOG_URL: "",
      NOEMA_KPI_TAIL_COMMAND:
        "printf '%s\\n' '{\"event\":\"http_request\",\"route\":\"/exchange\",\"status_code\":200,\"latency_ms\":120,\"timestamp\":\"2026-06-01T00:00:00.000Z\"}'",
      NOEMA_KPI_LOG_PATH: logPath,
      NOEMA_KPI_PROVENANCE_PATH: provenancePath,
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
      ...extraEnv,
    },
  });
}

describeWithUsablePosixBash("KPI collector output path authority", () => {
  it("refuses a symbolic-link log leaf without modifying its target", () => {
    const dir = temporaryDirectory();
    try {
      const externalTarget = join(dir, "outside.ndjson");
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeFileSync(externalTarget, "preserve-me\n");
      symlinkSync(externalTarget, logPath);

      const result = runCollector(logPath, provenancePath);

      expect(result.status).toBe(1);
      expect(readFileSync(externalTarget, "utf8")).toBe("preserve-me\n");
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an existing FIFO log sink without opening or hanging on it", () => {
    const dir = temporaryDirectory();
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = `${logPath}.provenance.json`;
      if (spawnSync("mkfifo", [logPath]).status !== 0) return;

      const result = runCollector(logPath, provenancePath);

      expect(result.status).toBe(1);
      expect(result.signal).toBeNull();
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a symbolic-link output parent before collection", () => {
    const dir = temporaryDirectory();
    try {
      const externalDir = join(dir, "outside");
      const linkedDir = join(dir, "linked-output");
      mkdirSync(externalDir);
      symlinkSync(externalDir, linkedDir, "dir");
      const logPath = join(linkedDir, "exchange-30d.ndjson");
      const provenancePath = join(linkedDir, "exchange-30d.ndjson.provenance.json");

      const result = runCollector(logPath, provenancePath);

      expect(result.status).toBe(1);
      expect(existsSync(join(externalDir, "exchange-30d.ndjson"))).toBe(false);
      expect(existsSync(join(externalDir, "exchange-30d.ndjson.provenance.json"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a symbolic-link provenance leaf without modifying its target", () => {
    const dir = temporaryDirectory();
    try {
      const externalTarget = join(dir, "outside-provenance.json");
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = join(dir, "exchange-30d.ndjson.provenance.json");
      writeFileSync(externalTarget, "preserve-me\n");
      symlinkSync(externalTarget, provenancePath);

      const result = runCollector(logPath, provenancePath);

      expect(result.status).toBe(1);
      expect(readFileSync(externalTarget, "utf8")).toBe("preserve-me\n");
      expect(existsSync(logPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses one path being used for both the retained log and provenance", () => {
    const dir = temporaryDirectory();
    try {
      const sharedPath = join(dir, "exchange-30d.ndjson");

      const result = runCollector(sharedPath, sharedPath);

      expect(result.status).toBe(1);
      expect(existsSync(sharedPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not publish provenance when the retained-log read descriptor fails to close", () => {
    const dir = temporaryDirectory();
    try {
      const logPath = join(dir, "exchange-30d.ndjson");
      const provenancePath = `${logPath}.provenance.json`;
      const preloadPath = join(dir, "inject-log-close-failure.cjs");
      writeFileSync(
        preloadPath,
        `const fs = require("node:fs");\n`
          + `const { syncBuiltinESMExports } = require("node:module");\n`
          + `const originalOpenSync = fs.openSync;\n`
          + `const originalCloseSync = fs.closeSync;\n`
          + `const trackedReadDescriptors = new Set();\n`
          + `fs.openSync = function(path, flags, ...rest) {\n`
          + `  const descriptor = originalOpenSync.call(fs, path, flags, ...rest);\n`
          + `  if (path === process.env.NOEMA_KPI_LOG_PATH && typeof flags === "number"\n`
          + `    && (flags & fs.constants.O_WRONLY) === 0 && (flags & fs.constants.O_RDWR) === 0) {\n`
          + `    trackedReadDescriptors.add(descriptor);\n`
          + `  }\n`
          + `  return descriptor;\n`
          + `};\n`
          + `fs.closeSync = function(descriptor) {\n`
          + `  const failAfterClose = trackedReadDescriptors.delete(descriptor);\n`
          + `  originalCloseSync.call(fs, descriptor);\n`
          + `  if (failAfterClose) throw new Error("injected retained-log close failure");\n`
          + `};\n`
          + `syncBuiltinESMExports();\n`,
      );

      const result = runCollector(logPath, provenancePath, {
        NODE_OPTIONS: `--require=${preloadPath}`,
      });

      expect(result.status).toBe(1);
      expect(existsSync(logPath)).toBe(true);
      expect(existsSync(provenancePath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses case-only output aliases on case-insensitive filesystems", () => {
    const dir = temporaryDirectory();
    try {
      const probe = join(dir, "CaseProbe");
      writeFileSync(probe, "probe");
      if (!existsSync(join(dir, "caseprobe"))) return;
      rmSync(probe);

      const logPath = join(dir, "KPI.ndjson");
      const provenancePath = join(dir, "kpi.ndjson");
      const result = runCollector(logPath, provenancePath);

      expect(result.status).toBe(1);
      expect(readFileSync(logPath, "utf8")).toContain('"event":"http_request"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("publishes provenance only after the final open-log descriptor check", () => {
    const source = readFileSync("scripts/collect-kpi-logs.sh", "utf8");
    const publish = source.indexOf("writePrivateNoReplaceFile(provenancePath");
    const finalDescriptorCheck = source.indexOf("const afterDescriptor = fstatSync(descriptor)");

    expect(publish).toBeGreaterThan(0);
    expect(finalDescriptorCheck).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(finalDescriptorCheck);
    expect(source).not.toContain("const finalDescriptor = fstatSync(descriptor)");
    expect(source).not.toContain("unlinkSync(provenancePath)");
  });
});
