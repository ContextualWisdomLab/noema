#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for smoke checks."
  exit 1
fi

: "${NOEMA_EXCHANGE_URL:?Set NOEMA_EXCHANGE_URL to the deployed /exchange endpoint.}"
SMOKE_EVIDENCE_PATH="${NOEMA_SMOKE_EVIDENCE_PATH:-}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

health_json="${tmpdir}/health.json"
health_headers="${tmpdir}/health-headers.txt"
exchange_json="${tmpdir}/exchange.json"
exchange_headers="${tmpdir}/exchange-headers.txt"
evidence_file="${tmpdir}/smoke-evidence.json"

checks=()

record_check() {
  local name="$1"
  local status="$2"
  local message="$3"
  checks+=("{\"name\":\"${name}\",\"status\":\"${status}\",\"message\":\"${message}\"}")
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

health_code=$(curl -sS -D "${health_headers}" -o "${health_json}" -w "%{http_code}" "${NOEMA_EXCHANGE_URL%/exchange}/health" || true)
health_ok=false
if [ "${health_code}" != "200" ]; then
  record_check "health-status" "FAIL" "Expected 200, got ${health_code}"
else
  health_ok=true
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

exchange_code=$(curl -sS -D "${exchange_headers}" -o "${exchange_json}" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d "{}" \
  "${NOEMA_EXCHANGE_URL}" || true)
exchange_ok=false
if [ "${exchange_code}" != "401" ]; then
  exchange_ok=false
  record_check "exchange-status" "FAIL" "Expected 401, got ${exchange_code}"
else
  exchange_ok=true
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

smoke_pass=$([[ "${health_ok}" == "true" && "${exchange_ok}" == "true" ]] && echo true || echo false)
cat > "${evidence_file}" <<EOF
{
  "passed": ${smoke_pass},
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "noema_exchange_url": "${NOEMA_EXCHANGE_URL}",
  "checks": [
    $(IFS=, ; echo "${checks[*]}")
  ]
}
EOF

if [ -n "${SMOKE_EVIDENCE_PATH}" ]; then
  cp "${evidence_file}" "${SMOKE_EVIDENCE_PATH}"
  echo "Smoke evidence written to ${SMOKE_EVIDENCE_PATH}"
fi

if [ "${smoke_pass}" != "true" ]; then
  echo "Smoke checks failed."
  cat "${evidence_file}"
  exit 1
fi

echo "Smoke checks passed."
cat "${evidence_file}"
