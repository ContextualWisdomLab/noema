#!/usr/bin/env bash

set -euo pipefail

TARGET_FILE="${NOEMA_KPI_LOG_PATH:-exchange-30d.ndjson}"
PROVENANCE_FILE="${NOEMA_KPI_PROVENANCE_PATH:-${TARGET_FILE}.provenance.json}"
: "${TARGET_FILE:?}"

if [[ -z "${NOEMA_KPI_TAIL_COMMAND:-}" && -z "${NOEMA_KPI_LOG_URL:-}" ]]; then
  cat <<'EOF'
ERROR: NOEMA_KPI_TAIL_COMMAND or NOEMA_KPI_LOG_URL is required.

Example:
  NOEMA_KPI_TAIL_COMMAND='timeout 30s wrangler tail noema --env production --format json' \
  NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
  NOEMA_KPI_SOURCE_KIND=production \
  NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
  npm run kpi:collect

If using Logpush/외부 아카이브 export 커맨드:
  NOEMA_KPI_TAIL_COMMAND='curl -sS "https://.../export?start=...&end=..."' \
  NOEMA_KPI_SOURCE_KIND=production \
  NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
  npm run kpi:collect

또는 외부 아카이브 URL이 있다면:
  NOEMA_KPI_LOG_URL=https://.../path/to/exchange-30d.ndjson \
  NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
  NOEMA_KPI_SOURCE_KIND=production \
  NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
  npm run kpi:collect

Note:
  실행 커맨드는 종료(exit) 가능한 단일 명령이어야 하며, 30일 구간을 담는 NDJSON 파일을 출력해야 합니다.
  NOEMA_KPI_SOURCE_ID에는 URL, 토큰, 쿼리스트링, placeholder 같은 값을 넣지 말고 감사 가능한 출처 라벨만 넣습니다.
EOF
  exit 1
fi

if [[ "${NOEMA_KPI_SOURCE_KIND:-}" != "production" ]]; then
  echo 'ERROR: NOEMA_KPI_SOURCE_KIND=production is required.'
  exit 1
fi

if [[ -z "${NOEMA_KPI_SOURCE_ID:-}" ]]; then
  echo 'ERROR: NOEMA_KPI_SOURCE_ID is required and must be a stable non-secret source label.'
  exit 1
fi

node --input-type=module <<'NODE'
import { hasUnsafeSourceId } from "./scripts/lib/source-id.mjs";

if (hasUnsafeSourceId(process.env.NOEMA_KPI_SOURCE_ID)) {
  console.error("ERROR: NOEMA_KPI_SOURCE_ID must be a stable non-secret label, not a placeholder, URL, query string, token, secret, or API/private/access key.");
  process.exit(1);
}
NODE

echo "Collecting KPI logs to ${TARGET_FILE}..."

SOURCE_METHOD=""
if [[ -n "${NOEMA_KPI_LOG_URL:-}" ]]; then
  SOURCE_METHOD="log-url"
  if ! curl -sS "${NOEMA_KPI_LOG_URL}" -o "${TARGET_FILE}"; then
    echo "Failed to download KPI logs from NOEMA_KPI_LOG_URL."
    exit 1
  fi
else
  SOURCE_METHOD="tail-command"
  if ! bash -lc "${NOEMA_KPI_TAIL_COMMAND}" > "${TARGET_FILE}"; then
    echo "Failed to collect KPI logs."
    exit 1
  fi
fi

if [[ ! -s "${TARGET_FILE}" ]]; then
  echo "Collected KPI log file is empty."
  exit 1
fi

RECORDS="$(wc -l < "${TARGET_FILE}" | tr -d '[:space:]')"
export NOEMA_KPI_PROVENANCE_FILE="${PROVENANCE_FILE}"
export NOEMA_KPI_PROVENANCE_LOG_PATH="${TARGET_FILE}"
export NOEMA_KPI_PROVENANCE_RECORDS="${RECORDS}"
export NOEMA_KPI_SOURCE_METHOD="${SOURCE_METHOD}"

node <<'NODE'
const fs = require("node:fs");

const provenancePath = process.env.NOEMA_KPI_PROVENANCE_FILE;
const payload = {
  sourceKind: process.env.NOEMA_KPI_SOURCE_KIND,
  sourceId: process.env.NOEMA_KPI_SOURCE_ID,
  sourceMethod: process.env.NOEMA_KPI_SOURCE_METHOD || null,
  logPath: process.env.NOEMA_KPI_PROVENANCE_LOG_PATH,
  records: Number(process.env.NOEMA_KPI_PROVENANCE_RECORDS || "0"),
  collectedAt: new Date().toISOString(),
  redaction: "Source URL and tail command are not persisted; set NOEMA_KPI_SOURCE_ID to a stable non-secret source label.",
};

fs.writeFileSync(provenancePath, `${JSON.stringify(payload, null, 2)}\n`);
NODE

echo "KPI logs saved to ${TARGET_FILE}"
echo "KPI provenance saved to ${PROVENANCE_FILE}"
echo "Collected records: ${RECORDS}"
exit 0
