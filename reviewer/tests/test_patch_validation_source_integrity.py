"""Source-checkout integrity regressions for patch validation."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)


def _patch() -> bytes:
    """Return one ordinary text patch for a source-integrity test."""
    return (
        "diff --git a/src/example.ts b/src/example.ts\n"
        "--- a/src/example.ts\n"
        "+++ b/src/example.ts\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
    ).encode()


def _request(patch_bytes: bytes) -> PatchValidationRequest:
    """Build one exact-head-bound request for malformed metadata testing."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha="2" * 40,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def test_runner_rejects_unverifiable_git_metadata_before_docker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An invalid Git control directory cannot masquerade as an exact checkout."""
    source = tmp_path / "source"
    source.mkdir()
    (source / ".git").mkdir()
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def should_not_run(_args, **_kwargs):
        """Fail if unverifiable source metadata reaches Docker."""
        raise AssertionError("Docker must not start")

    with pytest.raises(RuntimeError, match="source HEAD could not be verified"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=_request(patch_bytes),
            source_root=source,
            patch_path=patch_path,
        )
