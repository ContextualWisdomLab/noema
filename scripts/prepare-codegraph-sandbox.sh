#!/usr/bin/env bash
set -euo pipefail

: "${NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE:?NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

readonly TRUSTED_REPOSITORY="gcr.io/distroless/java-base-debian13"
readonly FIXED_GLIBC_VERSION="2.41-12+deb13u4"
readonly VULNERABLE_GLIBC_VERSION="2.41-12+deb13u3"
readonly DEBIAN_SNAPSHOT_BASE="https://snapshot.debian.org/archive/debian/20260711T202405Z"
readonly DEBIAN_SNAPSHOT_SUITE="trixie-proposed-updates"
readonly DEBIAN_PACKAGES_INDEX="main/binary-amd64/Packages.xz"
readonly DEBIAN_ARCHIVE_KEY_12_URL="https://ftp-master.debian.org/keys/archive-key-12.asc"
readonly DEBIAN_ARCHIVE_KEY_12_FINGERPRINT="B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8"
readonly DEBIAN_ARCHIVE_KEY_13_URL="https://ftp-master.debian.org/keys/archive-key-13.asc"
readonly DEBIAN_ARCHIVE_KEY_13_SHA256="6f1d277429dd7ffedcc6f8688a7ad9a458859b1139ffa026d1eeaadcbffb0da7"
readonly DEBIAN_ARCHIVE_KEY_13_FINGERPRINT="04B54C3CDCA79751B16BC6B5225629DF75B188BD"

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

verify_debian_archive_key() {
  local release="$1"
  local url="$2"
  local expected_fingerprint="$3"
  local expected_sha256="${4:-}"
  local archive_key="$work_dir/archive-key-${release}.asc"
  local archive_keyring="$work_dir/archive-key-${release}.gpg"
  local fingerprint

  curl --fail --location --silent --show-error \
    --proto '=https' --tlsv1.2 --retry 3 --retry-all-errors \
    --output "$archive_key" \
    "$url"
  if [ -n "$expected_sha256" ] && \
     ! printf '%s  %s\n' "$expected_sha256" "$archive_key" | sha256sum --check --status; then
    printf '::error::Debian %s archive key digest mismatch.\n' "$release" >&2
    exit 1
  fi
  fingerprint="$(
    gpg --batch --show-keys --with-colons --fingerprint "$archive_key" 2>/dev/null \
      | awk -F: '$1 == "fpr" { print $10; exit }'
  )"
  if [ "$fingerprint" != "$expected_fingerprint" ]; then
    printf '::error::Debian %s archive key fingerprint mismatch: %s.\n' \
      "$release" "${fingerprint:-missing}" >&2
    exit 1
  fi
  gpg --batch --yes --dearmor --output "$archive_keyring" "$archive_key"
  if [ -n "$expected_sha256" ]; then
    printf 'Verified Debian %s archive key %s (%s).\n' \
      "$release" "$expected_fingerprint" "$expected_sha256" >&2
  else
    printf 'Verified Debian %s archive key %s.\n' \
      "$release" "$expected_fingerprint" >&2
  fi
  printf '%s\n' "$archive_keyring"
}

ensure_debian_archive_keyring() {
  local combined_keyring="$work_dir/debian-archive-transition.gpg"
  local keyring_12
  local keyring_13

  if [ -f "$combined_keyring" ]; then
    printf '%s\n' "$combined_keyring"
    return
  fi

  keyring_12="$(verify_debian_archive_key \
    12 \
    "$DEBIAN_ARCHIVE_KEY_12_URL" \
    "$DEBIAN_ARCHIVE_KEY_12_FINGERPRINT")"
  keyring_13="$(verify_debian_archive_key \
    13 \
    "$DEBIAN_ARCHIVE_KEY_13_URL" \
    "$DEBIAN_ARCHIVE_KEY_13_FINGERPRINT" \
    "$DEBIAN_ARCHIVE_KEY_13_SHA256")"
  cat "$keyring_12" "$keyring_13" >"$combined_keyring"
  printf '%s\n' "$combined_keyring"
}

ensure_authenticated_snapshot_metadata() {
  local inrelease="$work_dir/InRelease"
  local packages_xz="$work_dir/Packages.xz"
  local packages="$work_dir/Packages"
  local archive_keyring
  local expected_packages_sha256

  if [ -f "$packages" ]; then
    return
  fi
  archive_keyring="$(ensure_debian_archive_keyring)"

  curl --fail --location --silent --show-error \
    --proto '=https' --tlsv1.2 --retry 3 --retry-all-errors \
    --output "$inrelease" \
    "$DEBIAN_SNAPSHOT_BASE/dists/$DEBIAN_SNAPSHOT_SUITE/InRelease"
  if ! gpgv --keyring "$archive_keyring" "$inrelease" >/dev/null 2>&1; then
    printf '::error::Debian snapshot InRelease signature verification failed.\n' >&2
    exit 1
  fi

  expected_packages_sha256="$(
    awk -v path="$DEBIAN_PACKAGES_INDEX" '
      /^SHA256:$/ { in_sha256 = 1; next }
      in_sha256 && /^[A-Za-z0-9-]+:$/ { in_sha256 = 0 }
      in_sha256 && $3 == path { print $1; exit }
    ' "$inrelease"
  )"
  if ! [[ "$expected_packages_sha256" =~ ^[0-9a-f]{64}$ ]]; then
    printf '::error::Authenticated Debian InRelease omitted SHA-256 for %s.\n' \
      "$DEBIAN_PACKAGES_INDEX" >&2
    exit 1
  fi

  curl --fail --location --silent --show-error \
    --proto '=https' --tlsv1.2 --retry 3 --retry-all-errors \
    --output "$packages_xz" \
    "$DEBIAN_SNAPSHOT_BASE/dists/$DEBIAN_SNAPSHOT_SUITE/$DEBIAN_PACKAGES_INDEX"
  if ! printf '%s  %s\n' "$expected_packages_sha256" "$packages_xz" | sha256sum --check --status; then
    printf '::error::Debian snapshot Packages.xz digest mismatch.\n' >&2
    exit 1
  fi
  xz --decompress --stdout "$packages_xz" >"$packages"
  printf 'Verified Debian snapshot metadata %s at %s.\n' \
    "$DEBIAN_SNAPSHOT_SUITE" "$DEBIAN_SNAPSHOT_BASE" >&2
}

download_reviewed_debian_package() {
  local package="$1"
  local packages="$work_dir/Packages"
  local record
  local filename
  local expected_sha256
  local destination

  ensure_authenticated_snapshot_metadata
  record="$(
    awk -v wanted_package="$package" -v wanted_version="$FIXED_GLIBC_VERSION" '
      BEGIN { RS = ""; FS = "\n" }
      {
        package_name = version = architecture = filename = sha256 = ""
        for (i = 1; i <= NF; i++) {
          if ($i ~ /^Package: /) package_name = substr($i, 10)
          else if ($i ~ /^Version: /) version = substr($i, 10)
          else if ($i ~ /^Architecture: /) architecture = substr($i, 15)
          else if ($i ~ /^Filename: /) filename = substr($i, 11)
          else if ($i ~ /^SHA256: /) sha256 = substr($i, 9)
        }
        if (package_name == wanted_package && version == wanted_version && architecture == "amd64") {
          print filename "\t" sha256
          exit
        }
      }
    ' "$packages"
  )"
  IFS=$'\t' read -r filename expected_sha256 <<<"$record"
  if [ -z "$filename" ] || ! [[ "$expected_sha256" =~ ^[0-9a-f]{64}$ ]]; then
    printf '::error::Authenticated Debian snapshot omitted %s=%s amd64.\n' \
      "$package" "$FIXED_GLIBC_VERSION" >&2
    exit 1
  fi
  case "$filename" in
    pool/main/g/glibc/*.deb) ;;
    *)
      printf '::error::Authenticated Debian metadata exposed unexpected glibc path %s.\n' \
        "$filename" >&2
      exit 1
      ;;
  esac

  destination="$work_dir/${filename##*/}"
  curl --fail --location --silent --show-error \
    --proto '=https' --tlsv1.2 --retry 3 --retry-all-errors \
    --output "$destination" \
    "$DEBIAN_SNAPSHOT_BASE/$filename"
  if ! printf '%s  %s\n' "$expected_sha256" "$destination" | sha256sum --check --status; then
    printf '::error::Debian package digest mismatch for %s.\n' "${filename##*/}" >&2
    exit 1
  fi

  test "$(dpkg-deb -f "$destination" Package)" = "$package"
  test "$(dpkg-deb -f "$destination" Version)" = "$FIXED_GLIBC_VERSION"
  test "$(dpkg-deb -f "$destination" Architecture)" = "amd64"
  printf 'Verified Debian snapshot package %s (%s).\n' "$package" "$expected_sha256" >&2
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
  printf 'Derived local CodeGraph sandbox %s with authenticated Debian glibc %s.\n' \
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
