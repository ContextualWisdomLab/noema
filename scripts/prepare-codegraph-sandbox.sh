#!/usr/bin/env bash
set -euo pipefail

: "${NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE:?NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

readonly TRUSTED_REPOSITORY="gcr.io/distroless/java-base-debian13"
readonly FIXED_GLIBC_VERSION="2.41-12+deb13u4"
readonly VULNERABLE_GLIBC_VERSION="2.41-12+deb13u3"
readonly DEBIAN_PROPOSED_SUITE="trixie-proposed-updates"

work_dir="$(mktemp -d)"
cleanup() {
  if [ -n "${source_container:-}" ]; then
    docker rm -f "$source_container" >/dev/null 2>&1 || true
  fi
  if [ -n "${final_container:-}" ]; then
    docker rm -f "$final_container" >/dev/null 2>&1 || true
  fi
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
  local container_var="$3"
  local destination="$work_dir/${package}-${container_var}.status"
  local container

  container="$(docker create "$image" /noema-inspection-only)"
  printf -v "$container_var" '%s' "$container"
  docker cp "$container:/var/lib/dpkg/status.d/$package" "$destination" >/dev/null
  awk '$1 == "Version:" { print $2; exit }' "$destination"
}

source_container=""
libc6_version="$(read_status_version "$resolved" libc6 source_container)"
docker rm -f "$source_container" >/dev/null
source_container=""
libc_bin_version="$(read_status_version "$resolved" libc-bin source_container)"
docker rm -f "$source_container" >/dev/null
source_container=""

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

  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends debian-archive-keyring >/dev/null
  proposed_list="$work_dir/debian-proposed.list"
  printf 'deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian %s main\n' \
    "$DEBIAN_PROPOSED_SUITE" >"$proposed_list"
  apt_options=(
    -o "Dir::Etc::sourcelist=$proposed_list"
    -o "Dir::Etc::sourceparts=-"
    -o "APT::Get::List-Cleanup=0"
  )
  sudo apt-get "${apt_options[@]}" update -qq
  (
    cd "$work_dir"
    apt-get "${apt_options[@]}" download \
      "libc6=$FIXED_GLIBC_VERSION" \
      "libc-bin=$FIXED_GLIBC_VERSION" >/dev/null
  )

  libc6_deb="$(find "$work_dir" -maxdepth 1 -type f -name "libc6_${FIXED_GLIBC_VERSION}_amd64.deb" -print -quit)"
  libc_bin_deb="$(find "$work_dir" -maxdepth 1 -type f -name "libc-bin_${FIXED_GLIBC_VERSION}_amd64.deb" -print -quit)"
  if [ -z "$libc6_deb" ] || [ -z "$libc_bin_deb" ]; then
    echo '::error::Authenticated Debian glibc packages were not downloaded at the reviewed version.'
    exit 1
  fi

  for package_file in "$libc6_deb" "$libc_bin_deb"; do
    test "$(dpkg-deb -f "$package_file" Version)" = "$FIXED_GLIBC_VERSION"
    test "$(dpkg-deb -f "$package_file" Architecture)" = "amd64"
  done

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

  final_container=""
  patched_libc6="$(read_status_version "$final_image" libc6 final_container)"
  docker rm -f "$final_container" >/dev/null
  final_container=""
  patched_libc_bin="$(read_status_version "$final_image" libc-bin final_container)"
  docker rm -f "$final_container" >/dev/null
  final_container=""
  test "$patched_libc6" = "$FIXED_GLIBC_VERSION"
  test "$patched_libc_bin" = "$FIXED_GLIBC_VERSION"
  printf 'Derived local CodeGraph sandbox %s with Debian-authenticated glibc %s.\n' \
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
