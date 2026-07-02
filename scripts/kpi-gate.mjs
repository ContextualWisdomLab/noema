#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { hasUnsafeSourceId } from "./lib/source-id.mjs";

const logPath = process.argv[2] ?? process.env.NOEMA_KPI_LOG_PATH ?? "exchange-30d.ndjson";
const failThreshold = process.argv[3] ?? process.env.NOEMA_KPI_FAILURE_THRESHOLD ?? "0.02";
const p95Threshold = process.argv[4] ?? process.env.NOEMA_KPI_P95_THRESHOLD_MS ?? "300";
const strict = process.env.NOEMA_KPI_STRICT === "1";
const requireWindowDays = process.env.NOEMA_KPI_REQUIRE_WINDOW_DAYS ?? "";
const evidencePath = process.env.NOEMA_KPI_EVIDENCE_PATH;
const provenancePath = process.env.NOEMA_KPI_PROVENANCE_PATH ?? `${logPath}.provenance.json`;

const failureThreshold = Number(failThreshold);
const p95 = Number(p95Threshold);
const requiredWindow = Number(requireWindowDays);
if (!Number.isFinite(failureThreshold) || !Number.isFinite(p95)) {
  console.error("Invalid threshold values.");
  process.exit(1);
}
if (strict && Number.isFinite(requiredWindow) && requiredWindow <= 0) {
  console.error("NOEMA_KPI_REQUIRE_WINDOW_DAYS must be positive when strict KPI mode is enabled.");
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

const provenanceResult = strict ? await loadProductionProvenance(provenancePath) : {
  pass: true,
  provenance: null,
};

if (!provenanceResult.pass) {
  const payload = {
    status: "FAIL",
    strict,
    requireWindowDays: Number.isFinite(requiredWindow) && requiredWindow > 0 ? requiredWindow : null,
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

const commandNode = process.execPath;
const guardCommands = [
  {
    name: "kpi-check",
    command: [commandNode, "scripts/check-kpi.mjs", logPath, String(failureThreshold), String(p95)],
    env: Number.isFinite(requiredWindow) && requiredWindow > 0
      ? { NOEMA_KPI_REQUIRE_WINDOW_DAYS: String(requiredWindow) }
      : {},
  },
  {
    name: "kpi-alert",
    command: [commandNode, "scripts/evaluate-observability-alerts.mjs", logPath],
  },
];

let failed = false;
const stepSummaries = [];

for (const step of guardCommands) {
  const child = spawnSync(step.command[0], step.command.slice(1), {
    encoding: "utf8",
    env: {
      ...process.env,
      ...(step.env ?? {}),
    },
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
console.log(JSON.stringify({
  status: "PASS",
  path: logPath,
  provenancePath,
  failureThreshold,
  p95Threshold: p95,
}, null, 2));
await persistEvidence(evidence);

async function loadProductionProvenance(path) {
  if (!existsSync(path)) {
    return {
      pass: false,
      reason: `Missing KPI provenance file: ${path}. Strict KPI mode requires production log provenance.`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
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
  if (!collectedAt || Number.isNaN(Date.parse(collectedAt))) {
    return {
      pass: false,
      reason: "KPI provenance collectedAt must be an ISO timestamp in strict mode.",
    };
  }
  if (!Number.isFinite(records) || records <= 0) {
    return {
      pass: false,
      reason: "KPI provenance records must be a positive number in strict mode.",
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
    },
  };
}

async function persistEvidence(payload) {
  if (!evidencePath) return;
  try {
    await writeFile(evidencePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(`Failed to write KPI evidence file: ${evidencePath}`, error);
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
