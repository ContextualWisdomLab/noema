#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const NOW = new Date().toISOString();
const outDir = join(process.cwd(), "artifacts", "saleable-readiness", NOW.slice(0, 10).replace(/-/g, ""));
const auditFile = join(outDir, "goal-audit.json");
const pilotLog = "docs/pilot-readiness-log.md";
const checks = [];

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });

  return {
    command: `${command} ${args.join(" ")}`,
    exitCode: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function record(name, pass, details = {}) {
  checks.push({ name, pass, details });
}

function isDeferredCheck(item) {
  return item.details?.status === "deferred";
}

function hasCompletedPilotEntries(text) {
  const entries = text.split(/^## 항목\s+\d+/m).filter(Boolean);
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  const hasValidDate = (value) => dateOnlyRegex.test(value.trim());
  const failureRateRegex = /^-\s*`?exchange_failure_rate`?\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*$/m;
  const p95Regex = /^-\s*`?exchange_p95_latency_ms`?\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*$/m;
  const customerNameRegex = /^-\s*고객명:\s*.+/m;
  const onboardingDateRegex = /^-\s*온보딩 완료일:\s*([0-9]{4}-\d{2}-\d{2})/m;
  const handoverDateRegex = /^-\s*운영 전환 승인일:\s*([0-9]{4}-\d{2}-\d{2})/m;
  const evidencePathRegex = /^-\s*분석 데이터 경로:\s*.+/m;
  const traceIdRegex = /^- trace_id 샘플:\s*.+/m;
  const supportChannelRegex = /^-\s*지원 채널 합의:\s*.+/m;

  return entries.some((entry) => {
    const onboardingDateMatch = entry.match(onboardingDateRegex);
    const handoverDateMatch = entry.match(handoverDateRegex);
    const hasCompletedDate = onboardingDateMatch && hasValidDate(onboardingDateMatch[1]);
    const hasHandoverApprovalDate = handoverDateMatch && hasValidDate(handoverDateMatch[1]);
    const hasPilotApproval = /^-\s*\[x\]\s*운영 이관 승인\s*$/m.test(entry);
    const hasKpiP95 = /^-\s*\[x\]\s*(?:p95 <= 300|p95 < 300)\s*$/m.test(entry);
    const hasKpiFailRate = /^-\s*\[x\]\s*실패율 <= 0\.02\s*$/m.test(entry);
    const hasCustomer = customerNameRegex.test(entry);
    const hasSupportChannel = supportChannelRegex.test(entry);
    const failureRateMatch = entry.match(failureRateRegex);
    const p95Match = entry.match(p95Regex);
    const hasEvidencePath = evidencePathRegex.test(entry);
    const hasTraceSample = traceIdRegex.test(entry);
    const hasValidFailureRate = Boolean(failureRateMatch) && Number(failureRateMatch[1]) <= 0.02;
    const hasValidP95 = Boolean(p95Match) && Number(p95Match[1]) < 300;
    return Boolean(hasCustomer)
      && hasCompletedDate
      && hasHandoverApprovalDate
      && hasPilotApproval
      && hasKpiP95
      && hasKpiFailRate
      && hasEvidencePath
      && hasTraceSample
      && hasSupportChannel
      && hasValidFailureRate
      && hasValidP95;
  });
}

const requiredFiles = [
  "src/index.ts",
  "test/worker.test.ts",
  "package.json",
  "README.md",
  "wrangler.toml",
  "docs/api-spec.md",
  "docs/api-stability-contract.md",
  "docs/onboarding.md",
  "docs/runbook.md",
  "docs/sla-and-support.md",
  "docs/pricing-draft.md",
  "docs/terms-draft.md",
  "docs/deployment-guide.md",
  "docs/observability-kpi.md",
  "docs/goal-completion-audit.md",
  "docs/saleable-program-goal-registry.md",
  "docs/release-readiness-audit.md",
  "docs/saleable-program-readiness.md",
  "docs/pilot-readiness-checklist.md",
  "docs/pilot-readiness-log.md",
  "scripts/smoke-readiness.sh",
  "scripts/check-kpi.mjs",
  "scripts/evaluate-observability-alerts.mjs",
  "scripts/compute-kpi.mjs",
  "scripts/kpi-gate.mjs",
  "CHANGELOG.md",
  ".github/workflows/ci.yml",
  ".github/workflows/cd.yml",
  ".github/workflows/readiness-scan.yml",
];

mkdirSync(outDir, { recursive: true });

requiredFiles.forEach((file) => {
  record(`required artifact: ${file}`, existsSync(file));
});

const releaseVerify = runCommand("npm", ["run", "release:verify"]);
record("npm run release:verify", releaseVerify.exitCode === 0, {
  command: releaseVerify.command,
  exitCode: releaseVerify.exitCode,
  stdout: releaseVerify.stdout,
});

const securityScan = runCommand("npm", ["run", "security:scan"]);
record("npm run security:scan", securityScan.exitCode === 0, {
  command: securityScan.command,
  exitCode: securityScan.exitCode,
  stdout: securityScan.stdout,
});

const kpiLogPath = process.env.NOEMA_KPI_LOG_PATH || "exchange-30d.ndjson";
const kpiEvidencePath = process.env.NOEMA_KPI_EVIDENCE_PATH || join(outDir, "noema-kpi-evidence.json");
const kpiProvenancePath = process.env.NOEMA_KPI_PROVENANCE_PATH || `${kpiLogPath}.provenance.json`;
const strict = runCommand("npm", ["run", "release:verify:strict"], {
  env: {
    NOEMA_KPI_LOG_PATH: kpiLogPath,
    NOEMA_KPI_EVIDENCE_PATH: kpiEvidencePath,
    NOEMA_KPI_PROVENANCE_PATH: kpiProvenancePath,
  },
});
record("npm run release:verify:strict", strict.exitCode === 0, {
  command: strict.command,
  exitCode: strict.exitCode,
  stdout: strict.stdout,
  kpiLogPath,
  kpiEvidencePath,
  kpiProvenancePath,
});
if (existsSync(kpiEvidencePath)) {
  try {
    const parsed = JSON.parse(readFileSync(kpiEvidencePath, "utf8"));
    const checkEvidence = parsed.parsed?.check ?? null;
    const provenanceEvidence = parsed.provenance ?? null;
    const thresholdPass = Boolean(
      parsed.status === "PASS" &&
      parsed.requireWindowDays === 30 &&
      provenanceEvidence &&
      provenanceEvidence.sourceKind === "production" &&
      typeof provenanceEvidence.sourceId === "string" &&
      provenanceEvidence.sourceId.trim().length > 0 &&
      Number(provenanceEvidence.records) > 0 &&
      checkEvidence &&
      Number.isFinite(checkEvidence.exchange_failure_rate) &&
      Number.isFinite(checkEvidence.exchange_p95_latency_ms) &&
      checkEvidence.exchange_failure_rate <= 0.02 &&
      checkEvidence.exchange_p95_latency_ms < 300 &&
      checkEvidence.exchange_window_days >= 30
    );
    record("kpi evidence file present and pass", thresholdPass, {
      path: kpiEvidencePath,
      status: parsed.status,
      requireWindowDays: parsed.requireWindowDays,
      exchange_failure_rate: checkEvidence?.exchange_failure_rate,
      exchange_p95_latency_ms: checkEvidence?.exchange_p95_latency_ms,
      exchange_window_days: checkEvidence?.exchange_window_days,
      provenancePath: parsed.provenancePath,
      provenanceSourceKind: provenanceEvidence?.sourceKind,
      provenanceSourceId: provenanceEvidence?.sourceId,
      provenanceRecords: provenanceEvidence?.records,
      parsedPresent: Boolean(checkEvidence),
    });
  } catch (error) {
    record("kpi evidence file present and pass", false, {
      reason: "kpi evidence file not valid JSON",
      path: kpiEvidencePath,
    });
  }
} else {
  record("kpi evidence file present and pass", false, {
    reason: "kpi evidence file not generated",
    path: kpiEvidencePath,
  });
}

if (!existsSync(kpiLogPath)) {
  record("required kpi log file exists", false, {
    reason: `Missing KPI log file (${kpiLogPath}).`,
    status: "blocker",
    remediation: `Collect 30d production logs and provenance, then retry: NOEMA_KPI_SOURCE_KIND=production NOEMA_KPI_SOURCE_ID=<source> npm run kpi:collect && NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 npm run kpi:verify:strict.`,
  });
}
if (!existsSync(kpiProvenancePath)) {
  record("required kpi provenance file exists", false, {
    reason: `Missing KPI provenance file (${kpiProvenancePath}).`,
    status: "blocker",
    remediation: "Collect 30d production logs with NOEMA_KPI_SOURCE_KIND=production and NOEMA_KPI_SOURCE_ID set, then retry strict readiness.",
  });
}

if (process.env.NOEMA_EXCHANGE_URL) {
  const smokeEvidence = process.env.NOEMA_SMOKE_EVIDENCE_PATH || join(outDir, "noema-smoke-evidence.json");
  const smoke = runCommand("npm", ["run", "smoke:check"], {
    env: {
      NOEMA_EXCHANGE_URL: process.env.NOEMA_EXCHANGE_URL,
      NOEMA_SMOKE_EVIDENCE_PATH: smokeEvidence,
    },
  });
  record("smoke readiness check", smoke.exitCode === 0, {
    command: smoke.command,
    exitCode: smoke.exitCode,
    output: smoke.stdout,
    smokeEvidence,
  });
  if (existsSync(smokeEvidence)) {
    try {
      const parsed = JSON.parse(readFileSync(smokeEvidence, "utf8"));
      record("smoke evidence passed", parsed.passed === true, {
        path: smokeEvidence,
      });
    } catch (error) {
      record("smoke evidence parsing", false, {
        reason: "smoke evidence file not valid JSON",
        path: smokeEvidence,
      });
    }
    record("smoke evidence file present", true, {
      path: smokeEvidence,
    });
  } else {
    record("smoke evidence file present", false, {
      path: smokeEvidence,
    });
  }
} else {
  record("smoke readiness check", true, {
    reason: "NOEMA_EXCHANGE_URL not set",
    status: "deferred",
    note: "운영 증빙은 배포 환경에서만 강제 재검증",
  });
}

if (existsSync(pilotLog)) {
  const pilotText = readFileSync(pilotLog, "utf8");
  const hasCompletedPilot = hasCompletedPilotEntries(pilotText);
  record("pilot readiness has completed record", hasCompletedPilot, {
    path: pilotLog,
    requiredChecks: [
      "운영 이관 승인",
      "운영 전환 승인일",
      "온보딩 완료일",
      "고객명",
      "실패율 <= 0.02",
      "p95 < 300",
      "분석 데이터 경로",
      "trace_id 샘플",
      "지원 채널 합의",
    ],
    passed: hasCompletedPilot,
  });
} else {
  record("pilot readiness log exists", false, {
    reason: "pilot readiness log file missing or path changed",
  });
}

const blockingFailures = checks.filter((item) => !item.pass && !isDeferredCheck(item));
const deferredChecks = checks.filter((item) => isDeferredCheck(item));
const passed = blockingFailures.length === 0;
const output = {
  generatedAt: NOW,
  objective: "NOEMA-GOAL-SALEABLE-2026-07-02",
  passed,
  kpiLogPath,
  kpiProvenancePath,
  deferredChecks,
  checks,
};

writeFileSync(auditFile, JSON.stringify(output, null, 2));

console.log(`saleable-readiness-audit: ${passed ? "PASS" : "FAIL"}`);
console.log(`audit_file=${auditFile}`);

if (!passed) {
  console.log("Failed checks:");
  blockingFailures.forEach((item) => {
    console.log(`- ${item.name}`);
  });
  process.exit(1);
}
