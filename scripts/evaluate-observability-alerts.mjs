#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const inputPath = process.argv[2] ?? "exchange-30d.ndjson";

if (!existsSync(inputPath)) {
  console.error(`No such file: ${inputPath}. Generate it first with 'wrangler tail ... > ${inputPath}'.`);
  process.exit(1);
}

const fiveMinuteFailureThreshold = Number(process.env.NOEMA_ALERT_5M_FAILURE_RATE ?? "0.05");
const fiveMinuteP95Threshold = Number(process.env.NOEMA_ALERT_5M_P95_MS ?? "500");
const rateLimitConsecutiveMinutes = Number(process.env.NOEMA_ALERT_RATE_LIMIT_MINUTES ?? "3");
const workflowSpikeMultiplier = Number(process.env.NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER ?? "3");

if (![fiveMinuteFailureThreshold, fiveMinuteP95Threshold, rateLimitConsecutiveMinutes, workflowSpikeMultiplier].every(Number.isFinite)) {
  console.error("Invalid alert threshold environment values.");
  process.exit(1);
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

const text = await fs.readFile(inputPath, "utf8");
const lines = text.split("\n").filter(Boolean);

const windows5m = new Map();
const minuteBuckets = new Map();
const workflowBucket30m = new Map();
const allLatencies = [];
const errorCodeBuckets = new Map();
let total = 0;
let failures = 0;

for (const [index, line] of lines.entries()) {
  try {
    const record = JSON.parse(line);
    if ((record.event || "http_request") !== "http_request") continue;

    const route = resolveRoute(record);
    if (route !== "/exchange") continue;

    let timestampMs = resolveTimestampMs(record);
    if (timestampMs == null) {
      const syntheticWindowMs = (lines.length - index) * 60_000;
      timestampMs = Date.now() - syntheticWindowMs;
    }

    const status = Number(record.status_code || record.status || record.response?.status);
    const latency = Number(record.latency_ms || record.latencyMs || record.duration_ms);
    const errorCode = record.error_code || "";

    total += 1;

    const window5m = Math.floor(timestampMs / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
    const bucket5m = windows5m.get(window5m) || {
      total: 0,
      failures: 0,
      latencies: [],
    };
    bucket5m.total += 1;
    if (Number.isNaN(status) || status >= 400) {
      bucket5m.failures += 1;
      failures += 1;
    }
    if (errorCode === "ERR_RATE_LIMIT") {
      const minute = Math.floor(timestampMs / ONE_MINUTE_MS);
      minuteBuckets.set(minute, (minuteBuckets.get(minute) || 0) + 1);
    }
    if (errorCode) {
      errorCodeBuckets.set(errorCode, (errorCodeBuckets.get(errorCode) || 0) + 1);
    }

    if (errorCode === "ERR_WORKFLOW_NOT_ALLOWED") {
      const window30m = Math.floor(timestampMs / THIRTY_MINUTES_MS) * THIRTY_MINUTES_MS;
      workflowBucket30m.set(window30m, (workflowBucket30m.get(window30m) || 0) + 1);
    }

    if (!Number.isNaN(latency)) {
      bucket5m.latencies.push(latency);
      allLatencies.push(latency);
    }

    windows5m.set(window5m, bucket5m);
  } catch {
    // ignore
  }
}

if (total === 0) {
  console.log(JSON.stringify({
    total,
    failures,
    exchange_requests_30d: total,
    exchange_failures_30d: failures,
    exchange_failure_rate_30d: total ? failures / total : 0,
    exchange_p95_latency_ms_30d: null,
    exchange_failure_rate: 0,
    exchange_p95_latency_ms: null,
    pass: true,
    notes: ["No exchange log found; no alert rules evaluated."],
  }, null, 2));
  process.exit(0);
}

const sorted5mKeys = [...windows5m.keys()].sort((a, b) => a - b);
const failureRateAlerts = [];
const p95Alerts = [];

for (const key of sorted5mKeys) {
  const bucket = windows5m.get(key);
  const failureRate = bucket.total ? bucket.failures / bucket.total : 0;
  if (bucket.total > 0 && failureRate > fiveMinuteFailureThreshold) {
    failureRateAlerts.push({
      windowStart: new Date(key).toISOString(),
      total: bucket.total,
      failures: bucket.failures,
      failureRate,
      threshold: fiveMinuteFailureThreshold,
    });
  }

  if (bucket.total > 0) {
    const p95 = percentile95(bucket.latencies);
    if (p95 != null && p95 > fiveMinuteP95Threshold) {
      p95Alerts.push({
        windowStart: new Date(key).toISOString(),
        p95,
        threshold: fiveMinuteP95Threshold,
      });
    }
  }
}

const sortedMinuteKeys = [...minuteBuckets.keys()].sort((a, b) => a - b);
let maxConsecutiveRateLimit = 0;
let currentConsecutiveRateLimit = 0;
let prevMinuteKey = null;
for (const key of sortedMinuteKeys) {
  if ((minuteBuckets.get(key) || 0) > 0) {
    if (prevMinuteKey !== null && key !== prevMinuteKey + 1) {
      currentConsecutiveRateLimit = 0;
    }
    currentConsecutiveRateLimit += 1;
    maxConsecutiveRateLimit = Math.max(maxConsecutiveRateLimit, currentConsecutiveRateLimit);
  }
  prevMinuteKey = key;
}

const rateLimitAlarm = maxConsecutiveRateLimit >= rateLimitConsecutiveMinutes;

const sortedWorkflowWindowKeys = [...workflowBucket30m.keys()].sort((a, b) => a - b);
const workflowAlarmWindows = [];
for (let index = 1; index < sortedWorkflowWindowKeys.length; index += 1) {
  const previous = workflowBucket30m.get(sortedWorkflowWindowKeys[index - 1]) || 0;
  const current = workflowBucket30m.get(sortedWorkflowWindowKeys[index]) || 0;
  if (previous > 0 && current >= previous * workflowSpikeMultiplier) {
    workflowAlarmWindows.push({
      windowStart: new Date(sortedWorkflowWindowKeys[index]).toISOString(),
      previousWindowCount: previous,
      currentWindowCount: current,
      multiplier: workflowSpikeMultiplier,
    });
  }
}

const pass = failureRateAlerts.length === 0 && p95Alerts.length === 0 && !rateLimitAlarm && workflowAlarmWindows.length === 0;
const exchangeFailureRate30d = total ? failures / total : 0;
const exchangeP95LatencyMs30d = percentile95(allLatencies);
const exchangeFailureRate = exchangeFailureRate30d;
const exchangeP95LatencyMs = exchangeP95LatencyMs30d;

const errorCodeTop = [...errorCodeBuckets.entries()]
    .map(([error_code, count]) => ({ error_code, count }))
    .sort((a, b) => b.count - a.count || a.error_code.localeCompare(b.error_code))
    .slice(0, 10);
  const alertSummary = {
  fiveMinFailureRate: {
    thresholds: {
      failureRate: fiveMinuteFailureThreshold,
      p95LatencyMs: fiveMinuteP95Threshold,
    },
    windows: failureRateAlerts,
  },
  rateLimitConsecutive: {
    minutes: maxConsecutiveRateLimit,
    thresholdMinutes: rateLimitConsecutiveMinutes,
    triggered: rateLimitAlarm,
    },
  workflowSpike: {
    multiplier: workflowSpikeMultiplier,
    windows: workflowAlarmWindows,
  },
  errorCodeTop10: errorCodeTop,
  pass,
  };

console.log(JSON.stringify({
  total,
  failures,
  exchange_requests_30d: total,
  exchange_failures_30d: failures,
  exchange_failure_rate_30d: exchangeFailureRate30d,
  exchange_p95_latency_ms_30d: exchangeP95LatencyMs30d,
  exchange_failure_rate: exchangeFailureRate,
  exchange_p95_latency_ms: exchangeP95LatencyMs,
  failureRate30d: exchangeFailureRate30d,
  p95LatencyMs30d: exchangeP95LatencyMs30d,
  alerts: alertSummary,
}, null, 2));

process.exit(pass ? 0 : 1);

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((0.95 * sorted.length) - 1));
  return sorted[idx];
}

function resolveRoute(record) {
  return normalizeRoute(
    record.route
    || record.request?.pathname
    || record.request?.path
    || record.request?.url
    || record.request?.uri
    || record.url,
  );
}

function normalizeRoute(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value, "https://example.com");
    return parsed.pathname;
  } catch {
    return String(value).split("?")[0];
  }
}

function resolveTimestampMs(record) {
  const candidates = [
    record.timestamp,
    record.timestamp_ms,
    record.timestampMs,
    record.event_timestamp,
    record.event_timestamp_ms,
    record.occurred_at,
    record.request?.timestamp,
    record.request?.timestamp_ms,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      if (candidate > 1e18) return Math.round(candidate / 1_000_000); // nanoseconds
      if (candidate > 1e15) return Math.round(candidate / 1_000); // microseconds
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) return parsed;
      const numeric = Number(candidate);
      if (!Number.isNaN(numeric)) {
        if (numeric > 1e18) return Math.round(numeric / 1_000_000);
        if (numeric > 1e15) return Math.round(numeric / 1_000);
        return numeric;
      }
    }
  }

  return null;
}
