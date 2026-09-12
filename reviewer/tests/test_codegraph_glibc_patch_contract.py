"""Regression contract for the CodeGraph sandbox glibc security repair."""

from pathlib import Path

from noema_reviewer import sandbox


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PREPARE_SCRIPT = REPOSITORY_ROOT / "scripts" / "prepare-codegraph-sandbox.sh"
REVIEWER_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "reviewer-ci.yml"
CENTRAL_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "central-review.yml"


def test_codegraph_sandbox_uses_one_authenticated_patch_helper() -> None:
    """Both reviewer paths must share the reviewed glibc preparation contract."""
    helper = PREPARE_SCRIPT.read_text(encoding="utf-8")
    assert 'readonly FIXED_GLIBC_VERSION="2.41-12+deb13u4"' in helper
    assert 'readonly DEBIAN_ARCHIVE_BASE="https://deb.debian.org/debian"' in helper
    assert 'readonly DEBIAN_GLIBC_POOL="pool/main/g/glibc"' in helper
    assert 'amd64-buildd.changes' in helper
    assert 'Checksums-Sha256:' in helper
    assert 'sha256sum --check --status' in helper
    assert "--proto '=https'" in helper
    assert "dpkg-deb -f" in helper
    assert "cosign verify" in helper
    assert "--certificate-identity=keyless@distroless.iam.gserviceaccount.com" in helper
    assert "--exit-code 1" in helper
    assert "--ignore-unfixed" in helper
    assert "--severity MEDIUM,HIGH,CRITICAL" in helper
    assert "dpkg --compare-versions" in helper
    assert "NOEMA_CODEGRAPH_SANDBOX_IMAGE" in helper

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
