#!/usr/bin/env node
const fs = await import("node:fs/promises");
const { existsSync } = await import("node:fs");

const inputPath = process.argv[2] ?? "exchange-30d.ndjson";
const failureThreshold = Number(process.argv[3] ?? "0.02");
const p95Threshold = Number(process.argv[4] ?? "300");
const requireWindowDays = Number(process.env.NOEMA_KPI_REQUIRE_WINDOW_DAYS);

if (!inputPath) {
  console.error("Usage: node scripts/check-kpi.mjs [wrangler-tail-ndjson] [failureThreshold] [p95ThresholdMs]");
  process.exit(1);
}

if (!existsSync(inputPath)) {
  console.error(`No such file: ${inputPath}. Generate it first with 'wrangler tail ... > ${inputPath}'.`);
  process.exit(1);
}

if (!Number.isFinite(failureThreshold) || !Number.isFinite(p95Threshold)) {
  console.error("Invalid threshold values.");
  process.exit(1);
}

if (Number.isFinite(requireWindowDays) && requireWindowDays <= 0) {
  console.error("NOEMA_KPI_REQUIRE_WINDOW_DAYS must be a positive number.");
  process.exit(1);
}

const text = await fs.readFile(inputPath, "utf8");
const lines = text.split("\n").filter(Boolean);
const latencies = [];
let exchanges = 0;
let failures = 0;
let minTimestampMs = Number.POSITIVE_INFINITY;
let maxTimestampMs = Number.NEGATIVE_INFINITY;
let exchangesWithTimestamp = 0;

for (const line of lines) {
  try {
    const record = JSON.parse(line);

    const route = resolveRoute(record);
    const event = record.event || "http_request";
    if (route !== "/exchange" || event !== "http_request") continue;

    exchanges += 1;

    const status = Number(record.status_code || record.status || record.response?.status);
    if (Number.isNaN(status) || status >= 400) failures += 1;

    const latency = Number(record.latency_ms || record.latencyMs || record.duration_ms);
    if (!Number.isNaN(latency)) latencies.push(latency);

    const ts = resolveTimestampMs(record);
    if (ts != null) {
      exchangesWithTimestamp += 1;
      minTimestampMs = Math.min(minTimestampMs, ts);
      maxTimestampMs = Math.max(maxTimestampMs, ts);
    }
  } catch {
    // ignore non-json/noema logs
  }
}

if (exchanges === 0) {
  console.error("No exchange events found.");
  process.exit(1);
}

latencies.sort((a, b) => a - b);
const p95Index = Math.max(0, Math.ceil((0.95 * latencies.length) - 1));
const p95 = latencies.length ? latencies[p95Index] : null;
const failureRate = failures / exchanges;
const hasWindowRequirement = Number.isFinite(requireWindowDays);
const requiredWindowMs = hasWindowRequirement ? requireWindowDays * 24 * 60 * 60 * 1000 : null;
const exchangeWindowMs = Number.isFinite(minTimestampMs) && Number.isFinite(maxTimestampMs)
  ? maxTimestampMs - minTimestampMs
  : 0;
const exchangeWindowDays = exchangeWindowMs > 0 ? exchangeWindowMs / 86400000 : 0;
const windowOk = !hasWindowRequirement || (exchangeWindowMs >= requiredWindowMs && exchangesWithTimestamp >= 1);

if (hasWindowRequirement && exchangesWithTimestamp === 0) {
  console.error("Windowed KPI check requires timestamps on exchange logs, but none were found.");
  process.exit(1);
}

const ok = failureRate <= failureThreshold && p95 !== null && p95 < p95Threshold && windowOk;

console.log(JSON.stringify({
  exchange_requests: exchanges,
  exchange_failures: failures,
  exchange_failure_rate: failureRate,
  exchange_p95_latency_ms: p95,
  exchange_window_days: exchangeWindowDays,
  exchange_window_require_days: hasWindowRequirement ? requireWindowDays : null,
  exchange_window_ms: hasWindowRequirement ? exchangeWindowMs : null,
  failureThreshold,
  p95Threshold,
  pass: ok,
}, null, 2));

process.exit(ok ? 0 : 1);

function normalizeRoute(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value, "https://example.com");
    return parsed.pathname;
  } catch {
    return String(value).split("?")[0];
  }
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

function resolveTimestampMs(record) {
  const candidates = [
    record.timestamp,
    record.timestamp_ms,
    record.timestampMs,
    record.occurredAt,
    record.event_timestamp,
    record.event_timestamp_ms,
    record.occurred_at,
    record.timestampNanos,
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
