#!/usr/bin/env bash

set -euo pipefail
set -o noclobber
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
export NOEMA_KPI_SCRIPT_ROOT="${SCRIPT_DIR}"

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
  수집 로그 경로는 새 파일이어야 하며 기존 파일·심볼릭 링크를 덮어쓰지 않습니다.
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

export NOEMA_KPI_OUTPUT_LOG_PATH="${TARGET_FILE}"
export NOEMA_KPI_OUTPUT_PROVENANCE_PATH="${PROVENANCE_FILE}"
node --input-type=module <<'NODE'
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const scriptRoot = process.env.NOEMA_KPI_SCRIPT_ROOT;
if (!scriptRoot) throw new Error("KPI collector script root is required.");
const { assertAcquisitionPrivatePathParents } = await import(
  pathToFileURL(join(scriptRoot, "lib", "acquisition-private-output.mjs")).href
);
const { hasUnsafeSourceId } = await import(
  pathToFileURL(join(scriptRoot, "lib", "source-id.mjs")).href
);

if (hasUnsafeSourceId(process.env.NOEMA_KPI_SOURCE_ID)) {
  console.error("ERROR: NOEMA_KPI_SOURCE_ID must be a stable non-secret label, not a placeholder, URL, query string, token, secret, or API/private/access key.");
  process.exit(1);
}

const logOutputPath = process.env.NOEMA_KPI_OUTPUT_LOG_PATH;
const provenanceOutputPath = process.env.NOEMA_KPI_OUTPUT_PROVENANCE_PATH;
for (const [label, path] of [
  ["NOEMA_KPI_LOG_PATH", logOutputPath],
  ["NOEMA_KPI_PROVENANCE_PATH", provenanceOutputPath],
]) {
  try {
    assertAcquisitionPrivatePathParents(path);
  } catch (error) {
    console.error(`ERROR: ${label} is outside the private output path authority: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (resolve(logOutputPath) === resolve(provenanceOutputPath)) {
  console.error("ERROR: NOEMA_KPI_LOG_PATH and NOEMA_KPI_PROVENANCE_PATH must identify distinct output files.");
  process.exit(1);
}
NODE

echo "Collecting KPI logs to ${TARGET_FILE}..."

SOURCE_METHOD=""
if [[ -n "${NOEMA_KPI_LOG_URL:-}" ]]; then
  SOURCE_METHOD="log-url"
  if ! node --input-type=module <<'NODE'
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const scriptRoot = process.env.NOEMA_KPI_SCRIPT_ROOT;
if (!scriptRoot) throw new Error("KPI collector script root is required.");
const {
  hasCredentialBearingProductionUrl,
  isReservedProductionHostname,
} = await import(pathToFileURL(join(scriptRoot, "lib", "production-host.mjs")).href);

const rawUrl = process.env.NOEMA_KPI_LOG_URL ?? "";
if (rawUrl !== rawUrl.trim()) {
  console.error("ERROR: NOEMA_KPI_LOG_URL must not contain surrounding whitespace.");
  process.exit(1);
}
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
else
  SOURCE_METHOD="tail-command"
fi

export NOEMA_KPI_SOURCE_METHOD="${SOURCE_METHOD}"
if ! node --input-type=module <<'NODE'
import { spawnSync } from "node:child_process";
import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const scriptRoot = process.env.NOEMA_KPI_SCRIPT_ROOT;
if (!scriptRoot) throw new Error("KPI collector script root is required.");
const { assertAcquisitionPrivatePathParents } = await import(
  pathToFileURL(join(scriptRoot, "lib", "acquisition-private-output.mjs")).href
);

function parentAuthority(path) {
  const parents = [];
  let current = dirname(resolve(path));
  const root = parse(current).root;
  while (current !== root) {
    const metadata = lstatSync(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("KPI log parent must remain a real directory.");
    }
    parents.push({ path: current, dev: metadata.dev, ino: metadata.ino, mode: metadata.mode });
    current = dirname(current);
  }
  return parents;
}

function sameParentAuthority(left, right) {
  return left.length === right.length && left.every((parent, index) => {
    const current = right[index];
    return parent.path === current.path
      && parent.dev === current.dev
      && parent.ino === current.ino
      && parent.mode === current.mode;
  });
}

const path = process.env.NOEMA_KPI_OUTPUT_LOG_PATH;
const method = process.env.NOEMA_KPI_SOURCE_METHOD;
const requiredFlags = ["O_WRONLY", "O_CREAT", "O_EXCL", "O_NOFOLLOW"];
if (!path || requiredFlags.some((name) => !Number.isInteger(constants[name]))) {
  throw new Error("KPI log collection requires a path and exclusive no-follow open support.");
}
assertAcquisitionPrivatePathParents(path);
const authorizedParents = parentAuthority(path);
let descriptor;
try {
  const flags = requiredFlags.reduce((value, name) => value | constants[name], 0);
  descriptor = openSync(path, flags, 0o600);
} catch (error) {
  if (error?.code === "EEXIST") throw new Error("KPI log output must be a new file.");
  throw error;
}
try {
  if (!sameParentAuthority(authorizedParents, parentAuthority(path))) {
    throw new Error("KPI log parent authority changed before collection.");
  }
  const command = method === "log-url"
    ? [
        "curl",
        "--proto",
        "=https",
        "--fail",
        "--silent",
        "--show-error",
        "--connect-timeout",
        "10",
        "--max-time",
        "600",
        process.env.NOEMA_KPI_LOG_URL,
      ]
    : [process.env.BASH || "bash", "-lc", process.env.NOEMA_KPI_TAIL_COMMAND];
  const completed = spawnSync(command[0], command.slice(1), {
    env: process.env,
    shell: false,
    stdio: ["inherit", descriptor, "inherit"],
  });
  if (completed.error) throw completed.error;
  if (completed.status !== 0) throw new Error(`KPI source command exited ${completed.status}`);

  assertAcquisitionPrivatePathParents(path);
  if (!sameParentAuthority(authorizedParents, parentAuthority(path))) {
    throw new Error("KPI log parent authority changed during collection.");
  }
  const opened = fstatSync(descriptor);
  const retained = lstatSync(path);
  const safe = opened.isFile()
    && !opened.isSymbolicLink()
    && opened.nlink === 1
    && opened.size > 0
    && retained.isFile()
    && !retained.isSymbolicLink()
    && retained.nlink === 1
    && opened.dev === retained.dev
    && opened.ino === retained.ino
    && opened.mode === retained.mode
    && opened.size === retained.size;
  if (!safe) throw new Error("KPI log output changed during collection.");
} catch (error) {
  try {
    ftruncateSync(descriptor, 0);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      "KPI log collection failed and could not be truncated; operator removal is required.",
    );
  }
  throw error;
} finally {
  closeSync(descriptor);
}
NODE
then
  echo "Failed to collect KPI logs."
  exit 1
fi

if [[ ! -s "${TARGET_FILE}" ]]; then
  echo "Collected KPI log file is empty."
  exit 1
fi

export NOEMA_KPI_PROVENANCE_FILE="${PROVENANCE_FILE}"
export NOEMA_KPI_PROVENANCE_LOG_PATH="${TARGET_FILE}"
node --input-type=module <<'NODE'
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const scriptRoot = process.env.NOEMA_KPI_SCRIPT_ROOT;
if (!scriptRoot) throw new Error("KPI collector script root is required.");
const { assertAcquisitionPrivatePathParents } = await import(
  pathToFileURL(join(scriptRoot, "lib", "acquisition-private-output.mjs")).href
);
const { writePrivateNoReplaceFile } = await import(
  pathToFileURL(join(scriptRoot, "lib", "private-no-replace-output.mjs")).href
);

function isSafeLog(metadata) {
  return Boolean(
    metadata
      && typeof metadata.isFile === "function"
      && typeof metadata.isSymbolicLink === "function"
      && metadata.isFile()
      && !metadata.isSymbolicLink()
      && metadata.nlink === 1,
  );
}

function sameVersion(left, right) {
  return Boolean(
    left
      && right
      && left.dev === right.dev
      && left.ino === right.ino
      && left.mode === right.mode
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs
      && left.ctimeMs === right.ctimeMs,
  );
}

async function main() {
  const provenancePath = process.env.NOEMA_KPI_PROVENANCE_FILE;
  const logPath = process.env.NOEMA_KPI_PROVENANCE_LOG_PATH;
  if (!provenancePath || !logPath) {
    throw new Error("KPI provenance output paths are required.");
  }

  assertAcquisitionPrivatePathParents(logPath);
  assertAcquisitionPrivatePathParents(provenancePath);

  const noFollow = constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    throw new Error("KPI log provenance requires no-follow filesystem support.");
  }

  const descriptor = openSync(logPath, constants.O_RDONLY | noFollow);
  const hash = createHash("sha256");
  let logBytes = 0;
  let records = 0;
  let lineHasContent = false;
  let beforeDescriptor;
  let payload;
  try {
    beforeDescriptor = fstatSync(descriptor);
    const beforePath = lstatSync(logPath);
    if (!isSafeLog(beforeDescriptor) || !isSafeLog(beforePath) || !sameVersion(beforeDescriptor, beforePath)) {
      throw new Error("Collected KPI log must remain a stable single-link regular file.");
    }

    for await (const chunk of createReadStream(logPath, { fd: descriptor, autoClose: false })) {
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

    assertAcquisitionPrivatePathParents(logPath);
    const afterDescriptor = fstatSync(descriptor);
    const afterPath = lstatSync(logPath);
    if (!isSafeLog(afterDescriptor) || !isSafeLog(afterPath) || !sameVersion(beforeDescriptor, afterDescriptor) || !sameVersion(afterDescriptor, afterPath)) {
      throw new Error("Collected KPI log changed while provenance identity was computed.");
    }

    if (!Number.isSafeInteger(records) || records <= 0) {
      throw new Error("Collected KPI log has no countable NDJSON records.");
    }

    payload = {
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
  } finally {
    closeSync(descriptor);
  }

  assertAcquisitionPrivatePathParents(logPath);
  const closedPath = lstatSync(logPath);
  if (!isSafeLog(closedPath) || !sameVersion(beforeDescriptor, closedPath)) {
    throw new Error("Collected KPI log changed before provenance publication.");
  }

  assertAcquisitionPrivatePathParents(provenancePath);
  if (lstatSync(provenancePath, { throwIfNoEntry: false })) {
    throw new Error("KPI provenance output must be a new file distinct from the collected log.");
  }
  writePrivateNoReplaceFile(provenancePath, `${JSON.stringify(payload, null, 2)}\n`);
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
