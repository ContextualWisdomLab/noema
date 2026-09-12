#!/usr/bin/env bash
set -euo pipefail

: "${NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE:?NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

readonly TRUSTED_REPOSITORY="gcr.io/distroless/java-base-debian13"
readonly FIXED_GLIBC_VERSION="2.41-12+deb13u4"
readonly VULNERABLE_GLIBC_VERSION="2.41-12+deb13u3"
readonly DEBIAN_ARCHIVE_BASE="https://ftp.debian.org/debian"
readonly DEBIAN_GLIBC_POOL="pool/main/g/glibc"
readonly DEBIAN_BUILD_MANIFEST="glibc_${FIXED_GLIBC_VERSION}_amd64-buildd.changes"

work_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

docker pull "$NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE"
resolved="$(docker image inspect "$NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE" --format '{{index .RepoDigests 0}}')"
case "$resolved" in
  "$TRUSTED_REPOSITORY"@sha256:????????????????????????????????????????????????????????????????) ;;
  *)
    printf '::error::Unexpected CodeGraph sandbox image identity: %s\n' "${resolved:-missing}"
    exit 1
    ;;
esac

cosign verify "$resolved" \
  --certificate-oidc-issuer=https://accounts.google.com \
  --certificate-identity=keyless@distroless.iam.gserviceaccount.com >/dev/null

read_status_version() {
  local image="$1"
  local package="$2"
  local destination="$work_dir/${package}-$(printf '%s' "$image" | sha256sum | cut -d ' ' -f1).status"
  local container

  container="$(docker create "$image" /noema-inspection-only)"
  if ! docker cp "$container:/var/lib/dpkg/status.d/$package" "$destination" >/dev/null; then
    docker rm -f "$container" >/dev/null 2>&1 || true
    return 1
  fi
  docker rm -f "$container" >/dev/null
  awk '$1 == "Version:" { print $2; exit }' "$destination"
}

download_reviewed_debian_package() {
  local package="$1"
  local filename="${package}_${FIXED_GLIBC_VERSION}_amd64.deb"
  local manifest="$work_dir/$DEBIAN_BUILD_MANIFEST"
  local destination="$work_dir/$filename"
  local expected_sha256

  if [ ! -f "$manifest" ]; then
    if ! curl --fail --location --silent --show-error \
      --proto '=https' --tlsv1.2 --retry 3 --retry-all-errors \
      --output "$manifest" \
      "$DEBIAN_ARCHIVE_BASE/dists/proposed-updates/$DEBIAN_BUILD_MANIFEST"; then
      printf '::error::Unable to retrieve retained Debian build manifest %s.\n' "$DEBIAN_BUILD_MANIFEST"
      exit 1
    fi
    grep -Fxq "Version: $FIXED_GLIBC_VERSION" "$manifest"
    grep -Eq '^Architecture: .*amd64' "$manifest"
    printf 'Verified retained Debian build manifest %s (%s).\n' \
      "$DEBIAN_BUILD_MANIFEST" "$(sha256sum "$manifest" | cut -d ' ' -f1)"
  fi

  expected_sha256="$(
    awk -v filename="$filename" '
      /^Checksums-Sha256:$/ { in_sha256 = 1; next }
      in_sha256 && /^[^ ]/ { in_sha256 = 0 }
      in_sha256 && $3 == filename { print $1; exit }
    ' "$manifest"
  )"
  case "$expected_sha256" in
    ????????????????????????????????????????????????????????????????) ;;
    *)
      printf '::error::Debian build manifest omitted SHA-256 for %s.\n' "$filename"
      exit 1
      ;;
  esac
  if ! [[ "$expected_sha256" =~ ^[0-9a-f]{64}$ ]]; then
    printf '::error::Debian build manifest exposed an invalid SHA-256 for %s.\n' "$filename"
    exit 1
  fi

  if ! curl --fail --location --silent --show-error \
    --proto '=https' --tlsv1.2 --retry 3 --retry-all-errors \
    --output "$destination" \
    "$DEBIAN_ARCHIVE_BASE/$DEBIAN_GLIBC_POOL/$filename"; then
    printf '::error::Unable to retrieve reviewed Debian package %s.\n' "$filename"
    exit 1
  fi
  if ! printf '%s  %s\n' "$expected_sha256" "$destination" | sha256sum --check --status; then
    printf '::error::Debian package digest mismatch for %s.\n' "$filename"
    exit 1
  fi

  test "$(dpkg-deb -f "$destination" Version)" = "$FIXED_GLIBC_VERSION"
  test "$(dpkg-deb -f "$destination" Architecture)" = "amd64"
  printf '%s\n' "$destination"
}

libc6_version="$(read_status_version "$resolved" libc6)"
libc_bin_version="$(read_status_version "$resolved" libc-bin)"

if [ -z "$libc6_version" ] || [ -z "$libc_bin_version" ]; then
  echo '::error::CodeGraph sandbox source omitted glibc package provenance.'
  exit 1
fi

printf 'Verified CodeGraph sandbox source %s with libc6=%s libc-bin=%s.\n' \
  "$resolved" "$libc6_version" "$libc_bin_version"

if dpkg --compare-versions "$libc6_version" ge "$FIXED_GLIBC_VERSION" && \
   dpkg --compare-versions "$libc_bin_version" ge "$FIXED_GLIBC_VERSION"; then
  final_image="$resolved"
else
  if [ "$libc6_version" != "$VULNERABLE_GLIBC_VERSION" ] || \
     [ "$libc_bin_version" != "$VULNERABLE_GLIBC_VERSION" ]; then
    printf '::error::Refusing unreviewed glibc transition: libc6=%s libc-bin=%s expected=%s or >=%s.\n' \
      "$libc6_version" "$libc_bin_version" "$VULNERABLE_GLIBC_VERSION" "$FIXED_GLIBC_VERSION"
    exit 1
  fi

  libc6_deb="$(download_reviewed_debian_package libc6)"
  libc_bin_deb="$(download_reviewed_debian_package libc-bin)"

  overlay="$work_dir/overlay"
  mkdir -p "$overlay/var/lib/dpkg/status.d"
  dpkg-deb -x "$libc6_deb" "$overlay"
  dpkg-deb -x "$libc_bin_deb" "$overlay"
  dpkg-deb -f "$libc6_deb" >"$overlay/var/lib/dpkg/status.d/libc6"
  dpkg-deb -f "$libc_bin_deb" >"$overlay/var/lib/dpkg/status.d/libc-bin"

  cat >"$work_dir/Dockerfile" <<'DOCKERFILE'
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
COPY overlay/ /
USER 65532:65532
DOCKERFILE

  local_tag="noema-codegraph-sandbox:${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}"
  docker build \
    --pull=false \
    --build-arg "BASE_IMAGE=$resolved" \
    --tag "$local_tag" \
    "$work_dir" >/dev/null
  final_image="$(docker image inspect "$local_tag" --format '{{.Id}}')"
  case "$final_image" in
    sha256:????????????????????????????????????????????????????????????????) ;;
    *)
      printf '::error::Derived CodeGraph sandbox did not resolve to an immutable local image ID: %s\n' \
        "${final_image:-missing}"
      exit 1
      ;;
  esac

  patched_libc6="$(read_status_version "$final_image" libc6)"
  patched_libc_bin="$(read_status_version "$final_image" libc-bin)"
  test "$patched_libc6" = "$FIXED_GLIBC_VERSION"
  test "$patched_libc_bin" = "$FIXED_GLIBC_VERSION"
  printf 'Derived local CodeGraph sandbox %s with Debian-manifest-verified glibc %s.\n' \
    "$final_image" "$FIXED_GLIBC_VERSION"
fi

trivy image \
  --exit-code 1 \
  --ignore-unfixed \
  --severity MEDIUM,HIGH,CRITICAL \
  --scanners vuln \
  --no-progress \
  "$final_image"

printf 'NOEMA_CODEGRAPH_SANDBOX_IMAGE=%s\n' "$final_image" >>"$GITHUB_ENV"
printf 'Verified and scanned CodeGraph sandbox image %s.\n' "$final_image"
