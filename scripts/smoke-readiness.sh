#!/usr/bin/env bash
set -euo pipefail
umask 077

for command in curl jq node; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required for smoke checks."
    exit 1
  fi
done

: "${NOEMA_EXCHANGE_URL:?Set NOEMA_EXCHANGE_URL to the deployed /exchange endpoint.}"
SMOKE_EVIDENCE_PATH="${NOEMA_SMOKE_EVIDENCE_PATH:-}"

endpoint_json="$(node - "${NOEMA_EXCHANGE_URL}" <<'NODE'
const raw = process.argv[2];
const fail = () => {
  console.error(
    "NOEMA_EXCHANGE_URL must be an exact deployed /exchange endpoint: "
      + "use canonical HTTPS, or HTTP only for loopback tests, without credentials, query, fragment, or trailing path.",
  );
  process.exit(64);
};

if (!raw || raw.length > 2048 || raw !== raw.trim()) fail();
let url;
try {
  url = new URL(raw);
} catch {
  fail();
}
const hostname = url.hostname.toLowerCase();
const loopback = hostname === "127.0.0.1"
  || hostname === "localhost"
  || hostname === "[::1]";
const allowedProtocol = url.protocol === "https:"
  || (url.protocol === "http:" && loopback);
const canonicalExchangeUrl = `${url.origin}/exchange`;
if (
  !allowedProtocol
  || !url.hostname
  || url.username
  || url.password
  || url.pathname !== "/exchange"
  || url.search
  || url.hash
  || raw !== canonicalExchangeUrl
) {
  fail();
}
process.stdout.write(JSON.stringify({
  base_url: url.origin,
  exchange_url: canonicalExchangeUrl,
}));
NODE
)"
base_url="$(jq -er '.base_url' <<<"${endpoint_json}")"
canonical_exchange_url="$(jq -er '.exchange_url' <<<"${endpoint_json}")"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

health_json="${tmpdir}/health.json"
health_headers="${tmpdir}/health-headers.txt"
ready_json="${tmpdir}/ready.json"
ready_headers="${tmpdir}/ready-headers.txt"
exchange_json="${tmpdir}/exchange.json"
exchange_headers="${tmpdir}/exchange-headers.txt"
checks_file="${tmpdir}/checks.ndjson"
evidence_file="${tmpdir}/smoke-evidence.json"
: >"${checks_file}"

record_check() {
  local name="$1"
  local status="$2"
  local message="$3"
  jq -cn \
    --arg name "${name}" \
    --arg status "${status}" \
    --arg message "${message}" \
    '{name: $name, status: $status, message: $message}' \
    >>"${checks_file}"
}

has_operational_headers() {
  local headers_file="$1"
  grep -iq "^x-trace-id:" "${headers_file}" && grep -iq "^x-latency-ms:" "${headers_file}"
}

has_security_headers() {
  local headers_file="$1"
  grep -iq "^cache-control:.*no-store" "${headers_file}" \
    && grep -iq "^pragma:.*no-cache" "${headers_file}" \
    && grep -iq "^x-content-type-options:[[:space:]]*nosniff" "${headers_file}"
}

has_exchange_auth_challenge() {
  local headers_file="$1"
  grep -iq '^www-authenticate:[[:space:]]*Bearer realm="noema", error="invalid_request"' "${headers_file}"
}

curl_probe() {
  curl \
    --silent \
    --show-error \
    --connect-timeout 5 \
    --max-time 15 \
    --max-filesize 1048576 \
    --proto '=http,https' \
    "$@"
}

health_code="$(curl_probe -D "${health_headers}" -o "${health_json}" -w "%{http_code}" "${base_url}/health" || true)"
health_ok=false
if [ "${health_code}" != "200" ]; then
  record_check "health-status" "FAIL" "Expected 200, got ${health_code:-000}"
else
  health_ok=true
  record_check "health-status" "PASS" "health returned 200"
fi
if [ "${health_ok}" == "true" ] && jq -e '.ok == true and .data.name=="noema" and (.trace_id|type == "string")' "${health_json}" >/dev/null; then
  record_check "health-schema" "PASS" "health schema valid"
else
  health_ok=false
  record_check "health-schema" "FAIL" "health schema invalid"
fi
if [ "${health_ok}" == "true" ] && has_operational_headers "${health_headers}"; then
  record_check "health-headers" "PASS" "required headers present"
else
  health_ok=false
  record_check "health-headers" "FAIL" "required headers missing"
fi
if [ "${health_ok}" == "true" ] && has_security_headers "${health_headers}"; then
  record_check "health-security-headers" "PASS" "security headers present"
else
  health_ok=false
  record_check "health-security-headers" "FAIL" "security headers missing"
fi

ready_code="$(curl_probe -D "${ready_headers}" -o "${ready_json}" -w "%{http_code}" "${base_url}/ready" || true)"
ready_ok=false
if [ "${ready_code}" != "200" ]; then
  record_check "runtime-readiness-status" "FAIL" "Expected 200 runtime readiness, got ${ready_code:-000}"
else
  ready_ok=true
  record_check "runtime-readiness-status" "PASS" "runtime readiness returned 200"
fi
if [ "${ready_ok}" == "true" ] && jq -e '
  .ok == true
  and .data.name == "noema"
  and .data.status == "ready"
  and .data.checks.configuration == "pass"
  and (.trace_id|type == "string")
' "${ready_json}" >/dev/null; then
  record_check "runtime-readiness-schema" "PASS" "runtime readiness schema valid"
else
  ready_ok=false
  record_check "runtime-readiness-schema" "FAIL" "runtime readiness schema invalid"
fi
if [ "${ready_ok}" == "true" ] && has_operational_headers "${ready_headers}"; then
  record_check "runtime-readiness-headers" "PASS" "runtime readiness headers present"
else
  ready_ok=false
  record_check "runtime-readiness-headers" "FAIL" "runtime readiness headers missing"
fi
if [ "${ready_ok}" == "true" ] && has_security_headers "${ready_headers}"; then
  record_check "runtime-readiness-security-headers" "PASS" "runtime readiness security headers present"
else
  ready_ok=false
  record_check "runtime-readiness-security-headers" "FAIL" "runtime readiness security headers missing"
fi
if [ "${ready_ok}" == "true" ] && grep -iq '^x-noema-readiness:[[:space:]]*ready' "${ready_headers}"; then
  record_check "runtime-readiness-state" "PASS" "runtime readiness state is ready"
else
  ready_ok=false
  record_check "runtime-readiness-state" "FAIL" "runtime readiness state is not ready"
fi

exchange_code="$(curl_probe -D "${exchange_headers}" -o "${exchange_json}" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d "{}" \
  "${canonical_exchange_url}" || true)"
exchange_ok=false
if [ "${exchange_code}" != "401" ]; then
  record_check "exchange-status" "FAIL" "Expected 401, got ${exchange_code:-000}"
else
  exchange_ok=true
  record_check "exchange-status" "PASS" "unauthenticated exchange returned 401"
fi
if [ "${exchange_ok}" == "true" ] && jq -e '.ok == false and .error_code == "ERR_AUTH_MISSING" and (.trace_id|type == "string")' "${exchange_json}" >/dev/null; then
  record_check "exchange-schema" "PASS" "ERR_AUTH_MISSING schema valid"
else
  exchange_ok=false
  record_check "exchange-schema" "FAIL" "ERR_AUTH_MISSING schema invalid"
fi
if [ "${exchange_ok}" == "true" ] && has_operational_headers "${exchange_headers}"; then
  record_check "exchange-headers" "PASS" "required headers present"
else
  exchange_ok=false
  record_check "exchange-headers" "FAIL" "required headers missing"
fi
if [ "${exchange_ok}" == "true" ] && has_security_headers "${exchange_headers}"; then
  record_check "exchange-security-headers" "PASS" "security headers present"
else
  exchange_ok=false
  record_check "exchange-security-headers" "FAIL" "security headers missing"
fi
if has_exchange_auth_challenge "${exchange_headers}"; then
  record_check "exchange-auth-challenge" "PASS" "bearer challenge present"
else
  exchange_ok=false
  record_check "exchange-auth-challenge" "FAIL" "bearer challenge missing"
fi

smoke_pass="$([[ "${health_ok}" == "true" && "${ready_ok}" == "true" && "${exchange_ok}" == "true" ]] && echo true || echo false)"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq -n \
  --argjson passed "${smoke_pass}" \
  --arg timestamp "${timestamp}" \
  --arg noema_exchange_url "${canonical_exchange_url}" \
  --slurpfile checks "${checks_file}" \
  '{
    passed: $passed,
    timestamp: $timestamp,
    noema_exchange_url: $noema_exchange_url,
    checks: $checks
  }' >"${evidence_file}"

if [ -n "${SMOKE_EVIDENCE_PATH}" ]; then
  install -m 0600 "${evidence_file}" "${SMOKE_EVIDENCE_PATH}"
  echo "Smoke evidence written to ${SMOKE_EVIDENCE_PATH}"
fi

if [ "${smoke_pass}" != "true" ]; then
  echo "Smoke checks failed."
  cat "${evidence_file}"
  exit 1
fi

echo "Smoke checks passed."
cat "${evidence_file}"
