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

function isLocalOnlyHostname(host) {
  const normalized = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  if (normalized === "::" || normalized === "::1" || normalized === "0.0.0.0") return true;
  if (/^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/i.test(normalized)) return true;
  return /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function checkExchangeUrl() {
  const rawValue = process.env.NOEMA_EXCHANGE_URL;
  const raw = typeof rawValue === "string" ? rawValue : "";
  if (!raw) {
    return fail("NOEMA_EXCHANGE_URL", "Set the production HTTPS /exchange endpoint.");
  }
  if (raw.length > 2048) {
    return fail("NOEMA_EXCHANGE_URL", "Must not exceed the smoke operator's 2048-character endpoint ceiling.");
  }
  if (raw !== raw.trim()) {
    return fail("NOEMA_EXCHANGE_URL", "Must be the exact canonical HTTPS /exchange endpoint without surrounding whitespace.");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail("NOEMA_EXCHANGE_URL", "Must be a valid URL.");
  }
  const host = url.hostname.toLowerCase();
  const canonicalHost = host.endsWith(".") ? host.slice(0, -1) : host;
  const canonicalExchangeUrl = `${url.origin}/exchange`;
  if (
    url.protocol !== "https:"
    || !url.hostname
    || url.username
    || url.password
    || url.pathname !== "/exchange"
    || url.search
    || url.hash
    || canonicalHost === "localhost"
    || canonicalHost.endsWith(".localhost")
    || isLocalOnlyHostname(canonicalHost)
    || raw !== canonicalExchangeUrl
  ) {
    return fail("NOEMA_EXCHANGE_URL", "Must be the exact canonical HTTPS /exchange endpoint without credentials, query, fragment, extra path, or a local-only host.");
  }
  return pass("NOEMA_EXCHANGE_URL", "canonical production exchange URL present");
}

function checkKpiSourceKind() {
  const rawValue = process.env.NOEMA_KPI_SOURCE_KIND;
  const sourceKind = typeof rawValue === "string" ? rawValue : "";
  if (!sourceKind.trim()) {
    return fail("NOEMA_KPI_SOURCE_KIND", 'Set NOEMA_KPI_SOURCE_KIND to "production".');
  }
  if (sourceKind !== sourceKind.trim()) {
    return fail("NOEMA_KPI_SOURCE_KIND", 'Use the exact canonical value "production" without surrounding whitespace.');
  }
  if (sourceKind !== "production") {
    return fail("NOEMA_KPI_SOURCE_KIND", 'Strict readiness evidence requires "production".');
  }
  return pass("NOEMA_KPI_SOURCE_KIND", "production");
}

function checkKpiSourceId() {
  const rawValue = process.env.NOEMA_KPI_SOURCE_ID;
  const value = typeof rawValue === "string" ? rawValue : "";
  if (!value.trim()) {
    return fail("NOEMA_KPI_SOURCE_ID", "Set a stable non-secret source label, for example cloudflare-logpush:noema-production.");
  }
  if (value !== value.trim()) {
    return fail("NOEMA_KPI_SOURCE_ID", "Use the exact canonical source label without surrounding whitespace.");
  }
  if (hasUnsafeSourceId(value)) {
    return fail("NOEMA_KPI_SOURCE_ID", "Use a stable non-secret label, not a placeholder, URL, query string, token, secret, or API/private/access key.");
  }
  return pass("NOEMA_KPI_SOURCE_ID", "non-secret source label present");
}

function checkKpiSourceInput() {
  const hasUrl = Boolean(env("NOEMA_KPI_LOG_URL"));
  const hasTailCommand = Boolean(env("NOEMA_KPI_TAIL_COMMAND"));
  if (hasUrl === hasTailCommand) {
    return fail(
      "NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND",
      "Set exactly one of NOEMA_KPI_LOG_URL or NOEMA_KPI_TAIL_COMMAND to keep production evidence provenance unambiguous.",
    );
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
