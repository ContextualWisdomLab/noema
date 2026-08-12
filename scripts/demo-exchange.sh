#!/usr/bin/env bash
set -euo pipefail

for command in curl node; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required for the demo."
    exit 1
  fi
done

: "${NOEMA_EXCHANGE_URL:?Set NOEMA_EXCHANGE_URL to the Noema /exchange endpoint, e.g. https://noema.example/exchange}"

endpoint_pair="$(node - "${NOEMA_EXCHANGE_URL}" <<'NODE'
const raw = process.argv[2];
const fail = () => {
  console.error(
    "NOEMA_EXCHANGE_URL must be an exact /exchange endpoint: use canonical HTTPS, "
      + "or HTTP only for loopback tests, without credentials, query, fragment, or trailing path.",
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
process.stdout.write(`${url.origin}\t${canonicalExchangeUrl}`);
NODE
)"
IFS=$'\t' read -r base_url canonical_exchange_url <<<"${endpoint_pair}"

curl_demo() {
  curl \
    --silent \
    --show-error \
    --proto '=http,https' \
    "$@"
}

echo "[1/3] health check"
curl_demo "${base_url}/health"
echo

echo "[2/3] unauthenticated exchange should fail with ERR_AUTH_MISSING"
curl_demo -X POST "${canonical_exchange_url}" \
  -H "content-type: application/json" \
  -d "{}" || true
echo

if [[ -n "${NOEMA_OIDC_TOKEN:-}" ]]; then
  echo "[3/3] exchange with token"
  curl_demo -X POST "${canonical_exchange_url}" \
    -H "authorization: Bearer ${NOEMA_OIDC_TOKEN}" \
    -H "content-type: application/json" \
    -d "{}"
  echo
else
  echo "[3/3] NOEMA_OIDC_TOKEN not set, skip tokened call"
fi
