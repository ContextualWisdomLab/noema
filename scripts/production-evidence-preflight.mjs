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

function normalizedIpHostname(host) {
  return host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
}

function ipv4OctetsFromHostname(host) {
  const normalized = normalizedIpHostname(host);
  const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (dotted) return dotted.slice(1).map(Number);

  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(normalized);
  if (!mapped) return null;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff];
}

function isLocalOnlyHostname(host) {
  const normalized = normalizedIpHostname(host);
  if (normalized === "::" || normalized === "::1") return true;
  const ipv4 = ipv4OctetsFromHostname(normalized);
  if (!ipv4) return false;
  return ipv4.every((octet) => octet === 0) || ipv4[0] === 127;
}

function isNonUnicastHostname(host) {
  const normalized = normalizedIpHostname(host);
  const ipv4 = ipv4OctetsFromHostname(normalized);
  if (ipv4) return ipv4[0] === 0 || ipv4[0] >= 224;
  return /^ff[0-9a-f]{2}:/i.test(normalized);
}

function isLinkLocalOrDocumentationAddress(host) {
  const normalized = normalizedIpHostname(host);
  const ipv4 = ipv4OctetsFromHostname(normalized);
  if (ipv4) {
    const [first, second, third] = ipv4;
    if (first === 169 && second === 254) return true;
    if (first === 192 && second === 0 && third === 2) return true;
    if (first === 198 && second === 51 && third === 100) return true;
    if (first === 203 && second === 0 && third === 113) return true;
    return false;
  }
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
  return /^2001:db8(?::|$)/i.test(normalized);
}

function isReservedProductionHostname(host) {
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host === "local"
    || host.endsWith(".local")
    || isLocalOnlyHostname(host)
    || isNonUnicastHostname(host)
    || isLinkLocalOrDocumentationAddress(host)
  ) return true;

  if (
    host === "example"
    || host.endsWith(".example")
    || host === "invalid"
    || host.endsWith(".invalid")
    || host === "test"
    || host.endsWith(".test")
  ) return true;

  return ["example.com", "example.net", "example.org"].some(
    (reservedHost) => host === reservedHost || host.endsWith(`.${reservedHost}`),
  );
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
  const tailCommand = env("NOEMA_KPI_TAIL_COMMAND");
  const hasUrl = rawUrl.trim().length > 0;
  const hasTailCommand = Boolean(tailCommand);
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
    if (url.protocol !== "https:" || !url.hostname) {
      return fail("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_LOG_URL must be a valid HTTPS URL.");
    }
    return pass("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_LOG_URL");
  }
  return pass("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND", "NOEMA_KPI_TAIL_COMMAND");
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
