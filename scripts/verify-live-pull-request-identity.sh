#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
if [ "$mode" != "capture" ] && [ "$mode" != "check" ]; then
  printf '::error::Expected capture or check mode.\n' >&2
  exit 1
fi
if [[ ! "${GITHUB_REPOSITORY:-}" =~ ^[^/]+/[^/]+$ ]]; then
  printf '::error::GitHub repository identity is invalid.\n' >&2
  exit 1
fi
if [[ ! "${NOEMA_PR_NUMBER:-}" =~ ^[1-9][0-9]*$ ]]; then
  printf '::error::Pull-request number is invalid.\n' >&2
  exit 1
fi
if [[ ! "${NOEMA_EXPECTED_HEAD_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  printf '::error::Expected pull-request head is invalid.\n' >&2
  exit 1
fi

read_live_pull_request() {
  local attempt output
  for attempt in 1 2 3; do
    if output="$(
      gh api --method GET "repos/${GITHUB_REPOSITORY}/pulls/${NOEMA_PR_NUMBER}" \
        --jq '[.head.sha,.base.ref] | @tsv' \
        2>&1
    )"; then
      printf '%s\n' "$output"
      return 0
    fi
    if printf '%s\n' "$output" | grep -Eq '\(HTTP (502|503|504)\)$' && [ "$attempt" -lt 3 ]; then
      sleep "$attempt"
      continue
    fi
    printf '::error::Live pull-request lookup failed after attempt %s.\n' "$attempt" >&2
    return 1
  done
}

read_live_base_sha() {
  local base_ref="$1" attempt output
  for attempt in 1 2 3; do
    if output="$(
      gh api --method GET "repos/${GITHUB_REPOSITORY}/git/ref/heads/${base_ref}" \
        --jq '.object.sha' \
        2>&1
    )"; then
      printf '%s\n' "$output"
      return 0
    fi
    if printf '%s\n' "$output" | grep -Eq '\(HTTP (502|503|504)\)$' && [ "$attempt" -lt 3 ]; then
      sleep "$attempt"
      continue
    fi
    printf '::error::Live pull-request base lookup failed after attempt %s.\n' "$attempt" >&2
    return 1
  done
}

pull_request_identity="$(read_live_pull_request)"
IFS=$'\t' read -r live_head_sha live_base_ref extra <<< "$pull_request_identity"
if [[ ! "$live_head_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf '::error::Live pull-request head is invalid.\n' >&2
  exit 1
fi
if ! git check-ref-format --branch "$live_base_ref" >/dev/null 2>&1 || [ -n "${extra:-}" ]; then
  printf '::error::Live pull-request base ref is invalid.\n' >&2
  exit 1
fi
live_base_sha="$(read_live_base_sha "$live_base_ref")"
if [[ ! "$live_base_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf '::error::Live pull-request base SHA is invalid.\n' >&2
  exit 1
fi

if [ "$mode" = "capture" ]; then
  if [ "$live_head_sha" != "$NOEMA_EXPECTED_HEAD_SHA" ]; then
    printf '::error::Live pull-request head does not match the reviewed head.\n' >&2
    exit 1
  fi
  if ! git merge-base --is-ancestor "$live_base_sha" "$live_head_sha"; then
    printf '::error::Pull-request head does not contain the live base %s@%s.\n' \
      "$live_base_ref" "$live_base_sha" >&2
    exit 1
  fi
  if [ -z "${GITHUB_ENV:-}" ]; then
    printf '::error::GitHub environment file is unavailable.\n' >&2
    exit 1
  fi
  {
    printf 'NOEMA_LIVE_PR_HEAD_SHA=%s\n' "$live_head_sha"
    printf 'NOEMA_LIVE_PR_BASE_REF=%s\n' "$live_base_ref"
    printf 'NOEMA_LIVE_PR_BASE_SHA=%s\n' "$live_base_sha"
  } >> "$GITHUB_ENV"
  exit 0
fi

if [[ ! "${NOEMA_LIVE_PR_HEAD_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || \
   [[ ! "${NOEMA_LIVE_PR_BASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || \
   ! git check-ref-format --branch "${NOEMA_LIVE_PR_BASE_REF:-}" >/dev/null 2>&1; then
  printf '::error::Captured pull-request identity is invalid.\n' >&2
  exit 1
fi
if [ "$NOEMA_LIVE_PR_HEAD_SHA" != "$NOEMA_EXPECTED_HEAD_SHA" ]; then
  printf '::error::Captured pull-request head does not match the reviewed head.\n' >&2
  exit 1
fi
if [ "$live_head_sha" != "$NOEMA_LIVE_PR_HEAD_SHA" ] || \
   [ "$live_base_ref" != "$NOEMA_LIVE_PR_BASE_REF" ] || \
   [ "$live_base_sha" != "$NOEMA_LIVE_PR_BASE_SHA" ]; then
  printf '::error::Pull-request identity changed during verification: head %s -> %s, base %s@%s -> %s@%s.\n' \
    "$NOEMA_LIVE_PR_HEAD_SHA" "$live_head_sha" \
    "$NOEMA_LIVE_PR_BASE_REF" "$NOEMA_LIVE_PR_BASE_SHA" \
    "$live_base_ref" "$live_base_sha" >&2
  exit 1
fi
