#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants, createReadStream, existsSync, rmSync } from "node:fs";
import { chmod, copyFile, lstat, mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { hasUnsafeSourceId } from "./lib/source-id.mjs";
import { createKpiChildEnvironment } from "./lib/kpi-child-environment.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_KPI_PROVENANCE_BYTES = 64 * 1024;
const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const parsedArgs = parseArgs(process.argv.slice(2));
const logPath = parsedArgs.positionals[0] ?? process.env.NOEMA_KPI_LOG_PATH ?? "exchange-30d.ndjson";
const failThreshold = parsedArgs.positionals[1] ?? process.env.NOEMA_KPI_FAILURE_THRESHOLD ?? "0.02";
const p95Threshold = parsedArgs.positionals[2] ?? process.env.NOEMA_KPI_P95_THRESHOLD_MS ?? "300";
const strict = parsedArgs.strict || process.env.NOEMA_KPI_STRICT === "1";
const requireWindowDays = parsedArgs.requireWindowDays ?? process.env.NOEMA_KPI_REQUIRE_WINDOW_DAYS ?? "";
const evidencePath = process.env.NOEMA_KPI_EVIDENCE_PATH;
const provenancePath = process.env.NOEMA_KPI_PROVENANCE_PATH ?? `${logPath}.provenance.json`;

const failureThreshold = Number(failThreshold);
const p95 = Number(p95Threshold);
const requiredWindow = Number(requireWindowDays);
if (!Number.isFinite(failureThreshold) || !Number.isFinite(p95)) {
  console.error("Invalid threshold values.");
  process.exit(1);
}
if (strict && (!Number.isFinite(requiredWindow) || requiredWindow <= 0)) {
  console.error("NOEMA_KPI_REQUIRE_WINDOW_DAYS must be a positive finite number when strict KPI mode is enabled.");
  process.exit(1);
}

if (!existsSync(logPath)) {
  const status = strict ? "FAIL" : "SKIP";
  const message = strict
    ? `No such file: ${logPath}. Generate it first with 'wrangler tail ... > ${logPath}' before KPI strict mode.`
    : `No KPI log file: ${logPath}. Skipping KPI guard in non-strict mode.`;
  const payload = {
    status,
    strict,
    requireWindowDays: Number.isFinite(requiredWindow) && requiredWindow > 0 ? requiredWindow : null,
    reason: message,
    path: logPath,
    failureThreshold,
    p95Threshold: p95,
    executedAt: new Date().toISOString(),
    steps: [],
  };
  console.log(JSON.stringify(payload, null, 2));
  await persistEvidence(payload);
  process.exit(strict ? 1 : 0);
}

const provenanceResult = strict ? await loadProductionProvenance(provenancePath, logPath) : {
  pass: true,
  provenance: null,
};

if (!provenanceResult.pass) {
  const payload = {
    status: "FAIL",
    strict,
    requireWindowDays: requiredWindow,
    reason: provenanceResult.reason,
    path: logPath,
    provenancePath,
    failureThreshold,
    p95Threshold: p95,
    executedAt: new Date().toISOString(),
    steps: [],
  };
  console.log(JSON.stringify(payload, null, 2));
  await persistEvidence(payload);
  process.exit(1);
}

let guardLogPath = logPath;
let snapshotDirectory = null;
if (strict && provenanceResult.provenance) {
  const snapshotResult = await createVerifiedLogSnapshot(logPath, provenanceResult.provenance);
  if (!snapshotResult.pass) {
    const payload = {
      status: "FAIL",
      strict,
      requireWindowDays: requiredWindow,
      reason: snapshotResult.reason,
      path: logPath,
      provenancePath,
      failureThreshold,
      p95Threshold: p95,
      executedAt: new Date().toISOString(),
      steps: [],
    };
    console.log(JSON.stringify(payload, null, 2));
    await persistEvidence(payload);
    process.exit(1);
  }
  guardLogPath = snapshotResult.snapshotPath;
  snapshotDirectory = snapshotResult.snapshotDirectory;
  const cleanupDirectory = snapshotDirectory;
  process.once("exit", () => rmSync(cleanupDirectory, { recursive: true, force: true }));
}

const commandNode = process.execPath;
const guardCommands = [
  {
    name: "kpi-check",
    command: [commandNode, "scripts/check-kpi.mjs", guardLogPath, String(failureThreshold), String(p95)],
    env: Number.isFinite(requiredWindow) && requiredWindow > 0
      ? { NOEMA_KPI_REQUIRE_WINDOW_DAYS: String(requiredWindow) }
      : {},
  },
  {
    name: "kpi-alert",
    command: [commandNode, "scripts/evaluate-observability-alerts.mjs", guardLogPath],
  },
];

let failed = false;
const stepSummaries = [];

for (const step of guardCommands) {
  const child = spawnSync(step.command[0], step.command.slice(1), {
    encoding: "utf8",
    env: createKpiChildEnvironment(step.name, process.env, step.env ?? {}),
  });
  const output = child.stdout || "";
  if (output) process.stdout.write(output);
  if (child.stderr) process.stderr.write(child.stderr);
  const parsedOutput = parseJsonOutput(output);
  stepSummaries.push({
    name: step.name,
    status: child.status === 0 ? "PASS" : "FAIL",
    exitCode: child.status,
    output: output.trim(),
    parsed: parsedOutput,
  });
  if (child.status !== 0) {
    failed = true;
    console.error(`Step failed: ${step.name}`);
  }
}

if (strict && provenanceResult.provenance) {
  try {
    const finalIdentity = await computeLogIdentity(logPath);
    const identityStable = finalIdentity.logSha256 === provenanceResult.provenance.logSha256
      && finalIdentity.logBytes === provenanceResult.provenance.logBytes;
    stepSummaries.push({
      name: "kpi-log-identity-final",
      status: identityStable ? "PASS" : "FAIL",
      exitCode: identityStable ? 0 : 1,
      output: "",
      parsed: finalIdentity,
    });
    if (!identityStable) {
      failed = true;
      console.error("KPI log identity changed while KPI checks were running.");
    }
  } catch (error) {
    failed = true;
    stepSummaries.push({
      name: "kpi-log-identity-final",
      status: "FAIL",
      exitCode: 1,
      output: "",
      parsed: null,
    });
    console.error("Failed to re-read KPI log identity after KPI checks.", error);
  }
}

if (snapshotDirectory) {
  rmSync(snapshotDirectory, { recursive: true, force: true });
}

const finalStatus = failed ? "FAIL" : "PASS";
const evidence = {
  status: finalStatus,
  strict,
  path: logPath,
  provenancePath,
  provenance: provenanceResult.provenance,
  failureThreshold,
  p95Threshold: p95,
  requireWindowDays: Number.isFinite(requiredWindow) && requiredWindow > 0 ? requiredWindow : null,
  executedAt: new Date().toISOString(),
  steps: stepSummaries.map((step) => ({
    name: step.name,
    status: step.status,
    exitCode: step.exitCode,
  })),
};

if (failed) {
  console.error(JSON.stringify({
    status: "FAIL",
    path: logPath,
    failureThreshold,
    p95Threshold: p95,
  }, null, 2));
  await persistEvidence(evidence);
  process.exit(1);
}
evidence.parsed = {
  check: stepSummaries.find((step) => step.name === "kpi-check")?.parsed ?? null,
  alert: stepSummaries.find((step) => step.name === "kpi-alert")?.parsed ?? null,
};
const evidencePersisted = await persistEvidence(evidence);
if (strict && !evidencePersisted) {
  console.error(JSON.stringify({
    status: "FAIL",
    path: logPath,
    provenancePath,
    reason: "KPI evidence could not be persisted in strict mode.",
    failureThreshold,
    p95Threshold: p95,
  }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  status: "PASS",
  path: logPath,
  provenancePath,
  failureThreshold,
  p95Threshold: p95,
}, null, 2));

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFileState(left, right) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mode === right.mode
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function provenanceReadFailure(path, reason) {
  return {
    pass: false,
    reason: `KPI provenance file ${reason}: ${path}.`,
  };
}

async function readBoundedProvenanceSnapshot(path) {
  const noFollow = constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    return provenanceReadFailure(path, "could not be read because O_NOFOLLOW is unavailable");
  }

  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | noFollow);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        pass: false,
        reason: `Missing KPI provenance file: ${path}. Strict KPI mode requires production log provenance.`,
      };
    }
    return provenanceReadFailure(path, "could not be opened safely without following links");
  }

  let result;
  try {
    const descriptorBefore = await handle.stat({ bigint: true });
    if (!descriptorBefore.isFile()) {
      result = provenanceReadFailure(path, "could not be read as a stable regular file");
    } else if (descriptorBefore.size > BigInt(MAX_KPI_PROVENANCE_BYTES)) {
      result = provenanceReadFailure(path, `exceeds ${MAX_KPI_PROVENANCE_BYTES}-byte limit`);
    } else {
      const pathBefore = await lstat(path, { bigint: true });
      if (!pathBefore.isFile() || !sameFileIdentity(descriptorBefore, pathBefore)) {
        result = provenanceReadFailure(path, "changed between pathname resolution and descriptor verification");
      } else {
        const buffer = Buffer.allocUnsafe(MAX_KPI_PROVENANCE_BYTES + 1);
        let totalBytes = 0;
        while (totalBytes < buffer.length) {
          const { bytesRead } = await handle.read(
            buffer,
            totalBytes,
            buffer.length - totalBytes,
            null,
          );
          if (bytesRead === 0) break;
          totalBytes += bytesRead;
        }

        if (totalBytes > MAX_KPI_PROVENANCE_BYTES) {
          result = provenanceReadFailure(path, `exceeds ${MAX_KPI_PROVENANCE_BYTES}-byte limit`);
        } else {
          const descriptorAfter = await handle.stat({ bigint: true });
          const pathAfter = await lstat(path, { bigint: true });
          if (
            !pathAfter.isFile()
            || !sameFileIdentity(descriptorAfter, pathAfter)
            || !sameStableFileState(descriptorBefore, descriptorAfter)
          ) {
            result = provenanceReadFailure(path, "changed while the bounded descriptor snapshot was being read");
          } else {
            result = {
              pass: true,
              bytes: Buffer.from(buffer.subarray(0, totalBytes)),
            };
          }
        }
      }
    }
  } catch {
    result = provenanceReadFailure(path, "could not be read");
  }

  try {
    await handle.close();
  } catch {
    return provenanceReadFailure(path, "could not close its verified descriptor");
  }
  return result;
}

async function loadProductionProvenance(path, expectedLogPath) {
  const provenanceSnapshot = await readBoundedProvenanceSnapshot(path);
  if (!provenanceSnapshot.pass) return provenanceSnapshot;
  const provenanceBytes = provenanceSnapshot.bytes;

  let provenanceText;
  try {
    provenanceText = fatalUtf8Decoder.decode(provenanceBytes);
  } catch {
    return {
      pass: false,
      reason: `KPI provenance file is not valid UTF-8: ${path}.`,
    };
  }

  let parsed;
  try {
    if (hasDuplicateJsonObjectKeys(provenanceText)) {
      return {
        pass: false,
        reason: `KPI provenance file contains duplicate decoded JSON object keys: ${path}.`,
      };
    }
    parsed = JSON.parse(provenanceText);
  } catch {
    return {
      pass: false,
      reason: `KPI provenance file is not valid JSON: ${path}.`,
    };
  }

  const sourceKind = String(parsed.sourceKind ?? "");
  const sourceId = typeof parsed.sourceId === "string" ? parsed.sourceId.trim() : "";
  const collectedAt = typeof parsed.collectedAt === "string" ? parsed.collectedAt : "";
  const records = Number(parsed.records);
  const logSha256 = typeof parsed.logSha256 === "string" ? parsed.logSha256 : "";
  const logBytes = parsed.logBytes;

  if (sourceKind !== "production") {
    return {
      pass: false,
      reason: `KPI provenance sourceKind must be "production" in strict mode; got "${sourceKind || "missing"}".`,
    };
  }
  if (!sourceId) {
    return {
      pass: false,
      reason: "KPI provenance sourceId is required in strict mode.",
    };
  }
  if (hasUnsafeSourceId(sourceId)) {
    return {
      pass: false,
      reason: "KPI provenance sourceId must be a stable non-secret label, not a placeholder, URL, query string, token, secret, or API/private/access key.",
    };
  }
  const collectedAtMs = Date.parse(collectedAt);
  if (
    !collectedAt
    || !canonicalUtcTimestampPattern.test(collectedAt)
    || Number.isNaN(collectedAtMs)
    || new Date(collectedAtMs).toISOString() !== collectedAt
  ) {
    return {
      pass: false,
      reason: "KPI provenance collectedAt must be an ISO timestamp in strict mode.",
    };
  }
  if (collectedAtMs > Date.now()) {
    return {
      pass: false,
      reason: "KPI provenance collectedAt cannot be in the future.",
    };
  }
  if (!Number.isFinite(records) || records <= 0) {
    return {
      pass: false,
      reason: "KPI provenance records must be a positive number in strict mode.",
    };
  }
  if (!/^[0-9a-f]{64}$/.test(logSha256)) {
    return {
      pass: false,
      reason: "KPI provenance logSha256 must be a 64-character lowercase SHA-256 digest in strict mode.",
    };
  }
  if (!Number.isSafeInteger(logBytes) || logBytes <= 0) {
    return {
      pass: false,
      reason: "KPI provenance logBytes must be a positive safe integer in strict mode.",
    };
  }

  let actualIdentity;
  try {
    actualIdentity = await computeLogIdentity(expectedLogPath);
  } catch {
    return {
      pass: false,
      reason: `KPI log identity could not be computed for strict provenance verification: ${expectedLogPath}.`,
    };
  }
  if (actualIdentity.logSha256 !== logSha256 || actualIdentity.logBytes !== logBytes) {
    return {
      pass: false,
      reason: "KPI log identity does not match production provenance.",
    };
  }

  return {
    pass: true,
    provenance: {
      sourceKind,
      sourceId,
      collectedAt,
      records,
      logPath: parsed.logPath ?? null,
      sourceMethod: parsed.sourceMethod ?? null,
      logSha256,
      logBytes,
    },
  };
}

async function createVerifiedLogSnapshot(sourcePath, provenance) {
  let snapshotDirectory = null;
  try {
    snapshotDirectory = await mkdtemp(join(tmpdir(), "noema-kpi-snapshot-"));
    const snapshotPath = join(snapshotDirectory, "exchange-30d.ndjson");
    await copyFile(sourcePath, snapshotPath);
    await chmod(snapshotPath, 0o400);
    const snapshotIdentity = await computeLogIdentity(snapshotPath);
    if (
      snapshotIdentity.logSha256 !== provenance.logSha256
      || snapshotIdentity.logBytes !== provenance.logBytes
    ) {
      rmSync(snapshotDirectory, { recursive: true, force: true });
      return {
        pass: false,
        reason: "KPI log changed before the verified snapshot could be established.",
      };
    }
    return {
      pass: true,
      snapshotDirectory,
      snapshotPath,
    };
  } catch {
    if (snapshotDirectory) {
      rmSync(snapshotDirectory, { recursive: true, force: true });
    }
    return {
      pass: false,
      reason: "KPI log could not be copied into a permission-restricted verified snapshot.",
    };
  }
}

async function computeLogIdentity(path) {
  const hash = createHash("sha256");
  let logBytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    logBytes += chunk.length;
  }
  return {
    logSha256: hash.digest("hex"),
    logBytes,
  };
}

async function persistEvidence(payload) {
  if (!evidencePath) return true;
  try {
    const noFollow = constants.O_NOFOLLOW;
    if (!Number.isInteger(noFollow)) {
      throw new Error("O_NOFOLLOW is unavailable for KPI evidence persistence.");
    }
    const handle = await open(
      evidencePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow,
      0o600,
    );
    try {
      await handle.writeFile(JSON.stringify(payload, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    console.error(`Failed to write KPI evidence file: ${evidencePath}`, error);
    return false;
  }
}

function parseJsonOutput(raw) {
  if (!raw) return null;
  let start = -1;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "{") {
      start = index;
      break;
    }
  }
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = raw.slice(start, index + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseArgs(args) {
  const result = {
    strict: false,
    requireWindowDays: undefined,
    positionals: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strict") {
      result.strict = true;
      continue;
    }
    if (arg === "--require-window-days") {
      result.requireWindowDays = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    result.positionals.push(arg);
  }
  return result;
}
