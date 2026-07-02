#!/usr/bin/env node
import { hasUnsafeSourceId } from "./lib/source-id.mjs";

const checks = [
  checkExchangeUrl(),
  checkKpiSourceKind(),
  checkKpiSourceId(),
  checkKpiSourceInput(),
];

const failed = checks.filter((check) => check.status === "FAIL");
const output = {
  passed: failed.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
};

console.log(JSON.stringify(output, null, 2));
if (!output.passed) {
  process.exit(1);
}

function checkExchangeUrl() {
  const raw = env("NOEMA_EXCHANGE_URL");
  if (!raw) {
    return fail("NOEMA_EXCHANGE_URL", "Set the production HTTPS /exchange endpoint.");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail("NOEMA_EXCHANGE_URL", "Must be a valid URL.");
  }
  if (url.protocol !== "https:") {
    return fail("NOEMA_EXCHANGE_URL", "Must use https.");
  }
  if (!url.pathname.endsWith("/exchange")) {
    return fail("NOEMA_EXCHANGE_URL", "Must point to the /exchange endpoint.");
  }
  return pass("NOEMA_EXCHANGE_URL", "production exchange URL is shaped correctly");
}

function checkKpiSourceKind() {
  const sourceKind = env("NOEMA_KPI_SOURCE_KIND");
  if (!sourceKind) {
    return fail("NOEMA_KPI_SOURCE_KIND", 'Set NOEMA_KPI_SOURCE_KIND to "production".');
  }
  if (sourceKind !== "production") {
    return fail("NOEMA_KPI_SOURCE_KIND", 'Strict readiness evidence requires "production".');
  }
  return pass("NOEMA_KPI_SOURCE_KIND", "production");
}

function checkKpiSourceId() {
  const value = env("NOEMA_KPI_SOURCE_ID");
  if (!value) {
    return fail("NOEMA_KPI_SOURCE_ID", "Set a stable non-secret source label, for example cloudflare-logpush:noema-production.");
  }
  if (hasUnsafeSourceId(value)) {
    return fail("NOEMA_KPI_SOURCE_ID", "Use a non-secret label, not a URL, query string, token, secret, or API/private/access key.");
  }
  return pass("NOEMA_KPI_SOURCE_ID", "non-secret source label present");
}

function checkKpiSourceInput() {
  const hasUrl = Boolean(env("NOEMA_KPI_LOG_URL"));
  const hasTailCommand = Boolean(env("NOEMA_KPI_TAIL_COMMAND"));
  if (!hasUrl && !hasTailCommand) {
    return fail("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "Set NOEMA_KPI_LOG_URL or NOEMA_KPI_TAIL_COMMAND to collect production NDJSON logs.");
  }
  return pass("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", hasUrl ? "NOEMA_KPI_LOG_URL" : "NOEMA_KPI_TAIL_COMMAND");
}

function env(key) {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function pass(name, message) {
  return { name, status: "PASS", message };
}

function fail(name, message) {
  return { name, status: "FAIL", message };
}
