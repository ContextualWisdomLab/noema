#!/usr/bin/env node
import { isReservedProductionHostname } from "./lib/production-host.mjs";
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
    || isReservedProductionHostname(canonicalHost)
    || raw !== canonicalExchangeUrl
  ) {
    return fail("NOEMA_EXCHANGE_URL", "Must be the exact canonical HTTPS /exchange endpoint without credentials, query, fragment, extra path, or a local/reserved placeholder host.");
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
  const rawUrlValue = process.env.NOEMA_KPI_LOG_URL;
  const rawUrl = typeof rawUrlValue === "string" ? rawUrlValue : "";
  const rawTailCommandValue = process.env.NOEMA_KPI_TAIL_COMMAND;
  const rawTailCommand = typeof rawTailCommandValue === "string" ? rawTailCommandValue : "";
  const hasUrl = rawUrl.length > 0;
  const hasTailCommand = rawTailCommand.trim().length > 0;
  if (hasUrl === hasTailCommand) {
    return fail(
      "NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND",
      "Set exactly one of NOEMA_KPI_LOG_URL or NOEMA_KPI_TAIL_COMMAND to keep production evidence provenance unambiguous.",
    );
  }
  if (hasUrl) {
    if (rawUrl !== rawUrl.trim()) {
      return fail("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_LOG_URL must not contain surrounding whitespace.");
    }
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return fail("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_LOG_URL must be a valid HTTPS URL.");
    }
    const host = url.hostname.toLowerCase();
    const canonicalHost = host.endsWith(".") ? host.slice(0, -1) : host;
    if (
      url.protocol !== "https:"
      || !url.hostname
      || url.username
      || url.password
      || isReservedProductionHostname(canonicalHost)
    ) {
      return fail("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_LOG_URL must be a credential-free HTTPS URL on a production host, not a local, benchmark, or documentation-only endpoint.");
    }
    return pass("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_LOG_URL");
  }
  return pass("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_TAIL_COMMAND");
}

function pass(name, message) {
  return { name, status: "PASS", message };
}

function fail(name, message) {
  return { name, status: "FAIL", message };
}
