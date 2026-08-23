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

TAIL_COMMAND_NON_WHITESPACE="${NOEMA_KPI_TAIL_COMMAND:-}"
TAIL_COMMAND_NON_WHITESPACE="${TAIL_COMMAND_NON_WHITESPACE//[[:space:]]/}"
if [[ -n "${NOEMA_KPI_LOG_URL:-}" && -n "${TAIL_COMMAND_NON_WHITESPACE}" ]]; then
  echo 'ERROR: Set exactly one of NOEMA_KPI_LOG_URL or NOEMA_KPI_TAIL_COMMAND.' >&2
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
  if ! node --input-type=module <<'NODE'
import {
  hasCredentialBearingProductionUrl,
  isReservedProductionHostname,
} from "./scripts/lib/production-host.mjs";

const rawUrl = process.env.NOEMA_KPI_LOG_URL ?? "";
let sourceUrl;
try {
  sourceUrl = new URL(rawUrl);
} catch {
  console.error("ERROR: NOEMA_KPI_LOG_URL must be an absolute HTTPS URL.");
  process.exit(1);
}
if (sourceUrl.protocol !== "https:" || !sourceUrl.hostname) {
  console.error("ERROR: NOEMA_KPI_LOG_URL must be an absolute HTTPS URL.");
  process.exit(1);
}
if (hasCredentialBearingProductionUrl(sourceUrl)) {
  console.error("ERROR: NOEMA_KPI_LOG_URL must not embed credentials; provide credentials through the reviewed transport/control-plane instead.");
  process.exit(1);
}
const host = sourceUrl.hostname.toLowerCase();
const canonicalHost = host.endsWith(".") ? host.slice(0, -1) : host;
if (isReservedProductionHostname(canonicalHost)) {
  console.error("ERROR: NOEMA_KPI_LOG_URL must use a production host, not a local, benchmark, or documentation-only endpoint.");
  process.exit(1);
}
NODE
  then
    exit 1
  fi
  if ! curl --proto '=https' --fail --silent --show-error "${NOEMA_KPI_LOG_URL}" -o "${TARGET_FILE}"; then
    echo "Failed to download KPI logs from NOEMA_KPI_LOG_URL."
    exit 1
  fi
else
  SOURCE_METHOD="tail-command"
  BASH_EXECUTABLE="${BASH:-bash}"
  if ! "${BASH_EXECUTABLE}" -lc "${NOEMA_KPI_TAIL_COMMAND}" > "${TARGET_FILE}"; then
    echo "Failed to collect KPI logs."
    exit 1
  fi
fi

if [[ ! -s "${TARGET_FILE}" ]]; then
  echo "Collected KPI log file is empty."
  exit 1
fi

export NOEMA_KPI_PROVENANCE_FILE="${PROVENANCE_FILE}"
export NOEMA_KPI_PROVENANCE_LOG_PATH="${TARGET_FILE}"
export NOEMA_KPI_SOURCE_METHOD="${SOURCE_METHOD}"

node <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");

async function main() {
  const provenancePath = process.env.NOEMA_KPI_PROVENANCE_FILE;
  const logPath = process.env.NOEMA_KPI_PROVENANCE_LOG_PATH;
  const hash = crypto.createHash("sha256");
  let logBytes = 0;
  let records = 0;
  let lineHasContent = false;

  for await (const chunk of fs.createReadStream(logPath)) {
    hash.update(chunk);
    logBytes += chunk.length;
    for (const byte of chunk) {
      if (byte === 0x0a) {
        if (lineHasContent) records += 1;
        lineHasContent = false;
        continue;
      }
      if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0d) {
        lineHasContent = true;
      }
    }
  }
  if (lineHasContent) records += 1;

  if (!Number.isSafeInteger(records) || records <= 0) {
    throw new Error("Collected KPI log has no countable NDJSON records.");
  }

  const payload = {
    sourceKind: process.env.NOEMA_KPI_SOURCE_KIND,
    sourceId: process.env.NOEMA_KPI_SOURCE_ID,
    sourceMethod: process.env.NOEMA_KPI_SOURCE_METHOD || null,
    logPath,
    records,
    collectedAt: new Date().toISOString(),
    logSha256: hash.digest("hex"),
    logBytes,
    redaction: "Source URL and tail command are not persisted; set NOEMA_KPI_SOURCE_ID to a stable non-secret source label.",
  };

  fs.writeFileSync(provenancePath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Collected records: ${records}`);
}

main().catch((error) => {
  console.error("Failed to compute KPI log provenance identity.", error);
  process.exit(1);
});
NODE

echo "KPI logs saved to ${TARGET_FILE}"
echo "KPI provenance saved to ${PROVENANCE_FILE}"
exit 0
