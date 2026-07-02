#!/usr/bin/env bash
set -euo pipefail

: "${NOEMA_EXCHANGE_URL:?Set NOEMA_EXCHANGE_URL to the Noema /exchange endpoint, e.g. https://noema.example/exchange}"

echo "[1/3] health check"
curl -sS "${NOEMA_EXCHANGE_URL%/exchange}/health"
echo

echo "[2/3] unauthenticated exchange should fail with ERR_AUTH_MISSING"
curl -sS -X POST "${NOEMA_EXCHANGE_URL}" \
  -H "content-type: application/json" \
  -d "{}" || true
echo

if [[ -n "${NOEMA_OIDC_TOKEN:-}" ]]; then
  echo "[3/3] exchange with token"
  curl -sS -X POST "${NOEMA_EXCHANGE_URL}" \
    -H "authorization: Bearer ${NOEMA_OIDC_TOKEN}" \
    -H "content-type: application/json" \
    -d "{}"
  echo
else
  echo "[3/3] NOEMA_OIDC_TOKEN not set, skip tokened call"
fi
