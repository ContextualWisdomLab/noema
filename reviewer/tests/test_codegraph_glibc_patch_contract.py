"""Regression contract for the CodeGraph sandbox glibc security repair."""

from pathlib import Path

from noema_reviewer import sandbox


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PREPARE_SCRIPT = REPOSITORY_ROOT / "scripts" / "prepare-codegraph-sandbox.sh"
REVIEWER_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "reviewer-ci.yml"
CENTRAL_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "central-review.yml"


def test_codegraph_sandbox_uses_one_authenticated_patch_helper() -> None:
    """Both reviewer paths must share one Debian-authenticated glibc repair contract."""
    helper = PREPARE_SCRIPT.read_text(encoding="utf-8")
    assert 'readonly FIXED_GLIBC_VERSION="2.41-12+deb13u4"' in helper
    assert (
        'readonly DEBIAN_SNAPSHOT_BASE="https://snapshot.debian.org/archive/debian/20260711T202405Z"'
        in helper
    )
    assert 'readonly DEBIAN_SNAPSHOT_SUITE="trixie-proposed-updates"' in helper
    assert 'readonly DEBIAN_ARCHIVE_KEY_12_URL="https://ftp-master.debian.org/keys/archive-key-12.asc"' in helper
    assert 'readonly DEBIAN_ARCHIVE_KEY_12_FINGERPRINT="B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8"' in helper
    assert 'readonly DEBIAN_ARCHIVE_KEY_13_URL="https://ftp-master.debian.org/keys/archive-key-13.asc"' in helper
    assert 'readonly DEBIAN_ARCHIVE_KEY_13_SHA256="6f1d277429dd7ffedcc6f8688a7ad9a458859b1139ffa026d1eeaadcbffb0da7"' in helper
    assert 'readonly DEBIAN_ARCHIVE_KEY_13_FINGERPRINT="04B54C3CDCA79751B16BC6B5225629DF75B188BD"' in helper
    assert '/usr/share/keyrings/debian-archive-keyring.gpg' not in helper
    assert 'main/binary-amd64/Packages.xz' in helper
    assert 'gpg --batch --yes --dearmor' in helper
    assert 'gpg --batch --show-keys --with-colons --fingerprint' in helper
    assert 'mapfile -t primary_fingerprints' in helper
    assert '"${#primary_fingerprints[@]}" -ne 1' in helper
    assert '"${primary_fingerprints[0]:-}" != "$expected_fingerprint"' in helper
    assert 'gpgv --keyring "$archive_keyring" "$inrelease"' in helper
    assert 'Checksums-Sha256:' not in helper
    assert 'amd64-buildd.changes' not in helper
    assert "SHA256:" in helper
    assert "sha256sum --check --status" in helper
    assert "xz --decompress --stdout" in helper
    assert "--proto '=https'" in helper
    assert "dpkg-deb -f" in helper
    assert "cosign verify" in helper
    assert "--certificate-identity=keyless@distroless.iam.gserviceaccount.com" in helper
    assert "--exit-code 1" in helper
    assert "--ignore-unfixed" in helper
    assert "--severity MEDIUM,HIGH,CRITICAL" in helper
    assert "dpkg --compare-versions" in helper
    assert "NOEMA_CODEGRAPH_SANDBOX_IMAGE" in helper
    assert 'Verified Debian %s archive key exact primary-key set %s.' in helper
    assert 'Verified Debian 13 archive key' in helper
    assert 'Verified Debian snapshot metadata' in helper
    assert '>&2' in helper

    for package in ("libc6", "libc-bin"):
        assert f'$(download_reviewed_debian_package {package})' in helper
    assert 'package_name == wanted_package && version == wanted_version && architecture == "amd64"' in helper
    assert 'print filename "\\t" sha256' in helper
    assert (
        'printf \'%s  %s\\n\' "$expected_sha256" "$destination" | sha256sum --check --status'
        in helper
    )
    assert 'test "$(dpkg-deb -f "$destination" Package)" = "$package"' in helper
    assert 'test "$(dpkg-deb -f "$destination" Version)" = "$FIXED_GLIBC_VERSION"' in helper
    assert 'test "$(dpkg-deb -f "$destination" Architecture)" = "amd64"' in helper

    for workflow_path in (REVIEWER_WORKFLOW, CENTRAL_WORKFLOW):
        workflow = workflow_path.read_text(encoding="utf-8")
        assert "scripts/prepare-codegraph-sandbox.sh" in workflow


def test_codegraph_sandbox_accepts_only_remote_or_locally_derived_immutable_identity() -> None:
    """The runner may consume the verified remote digest or one scanned local image ID."""
    assert sandbox.TRUSTED_CODEGRAPH_IMAGE_RE.fullmatch(
        f"{sandbox.TRUSTED_CODEGRAPH_IMAGE_REPOSITORY}@sha256:{'a' * 64}"
    )
    assert sandbox.TRUSTED_CODEGRAPH_LOCAL_IMAGE_RE.fullmatch(f"sha256:{'b' * 64}")
    assert not sandbox.TRUSTED_CODEGRAPH_LOCAL_IMAGE_RE.fullmatch("noema/codegraph:latest")
