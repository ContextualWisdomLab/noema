#!/usr/bin/env node
import fs from "node:fs";

const inputPath = process.argv[2] ?? "exchange-30d.ndjson";

if (!fs.existsSync(inputPath)) {
  console.error(`No such file: ${inputPath}. Generate it first with 'wrangler tail ... > ${inputPath}'.`);
  process.exit(1);
}

const text = fs.readFileSync(inputPath, "utf8");
const lines = text.split("\n").filter(Boolean);
const latencies = [];
let exchanges = 0;
let failures = 0;

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
  } catch (error) {
    // ignore non-json or non-noema logs
  }
}

if (exchanges === 0) {
  console.log(JSON.stringify({
    exchange_requests: exchanges,
    exchange_failures: failures,
    exchange_failure_rate: exchanges ? failures / exchanges : 0,
    exchange_p95_latency_ms: 0,
    note: "No exchange logs found",
  }, null, 2));
  process.exit(0);
}

latencies.sort((a, b) => a - b);
const p95Index = Math.max(0, Math.ceil((0.95 * latencies.length) - 1));
const p95 = latencies[p95Index];

console.log(JSON.stringify({
  exchange_requests: exchanges,
  exchange_failures: failures,
  exchange_failure_rate: exchanges ? failures / exchanges : 0,
  exchange_p95_latency_ms: p95,
}, null, 2));

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
