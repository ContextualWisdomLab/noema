"""Regression tests for immutable patch-validator build-control paths."""

from __future__ import annotations

import pytest

from noema_reviewer.patch_image_validation import inspect_patch_for_image


def _ordinary_patch(path: str) -> bytes:
    """Return one ordinary same-path text modification for ``path``."""
    return (
        f"diff --git a/{path} b/{path}\n"
        "index 1111111..2222222 100644\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        "@@ -1 +1 @@\n"
        "-old value\n"
        "+new value\n"
    ).encode("utf-8")


def test_image_profile_rejects_patch_validator_dockerignore() -> None:
    """A proposal cannot alter the active image build-context allowlist."""
    with pytest.raises(ValueError, match="profile forbids path"):
        inspect_patch_for_image(
            _ordinary_patch("Dockerfile.patch-validator.dockerignore")
        )
