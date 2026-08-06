"""Create/delete parity tests for the patch-validator image profile."""

from __future__ import annotations

import pytest

from noema_reviewer.patch_image_validation import inspect_patch_for_image


def _creation_patch(mode: str) -> bytes:
    """Return one canonical regular-file creation with ``mode``."""
    return (
        "diff --git a/src/new.ts b/src/new.ts\n"
        f"new file mode {mode}\n"
        "index 0000000..1111111\n"
        "--- /dev/null\n"
        "+++ b/src/new.ts\n"
        "@@ -0,0 +1 @@\n"
        "+created\n"
    ).encode("utf-8")


def _deletion_patch(mode: str) -> bytes:
    """Return one canonical regular-file deletion with ``mode``."""
    return (
        "diff --git a/src/old.ts b/src/old.ts\n"
        f"deleted file mode {mode}\n"
        "index 1111111..0000000\n"
        "--- a/src/old.ts\n"
        "+++ /dev/null\n"
        "@@ -1 +0,0 @@\n"
        "-obsolete\n"
    ).encode("utf-8")


@pytest.mark.parametrize("mode", ("100644", "100755"))
def test_image_profile_accepts_canonical_regular_file_creation(mode: str) -> None:
    """Creation metadata is allowed when it matches the canonical file operation."""
    assert inspect_patch_for_image(_creation_patch(mode)) == ("src/new.ts",)


@pytest.mark.parametrize("mode", ("100644", "100755"))
def test_image_profile_accepts_canonical_regular_file_deletion(mode: str) -> None:
    """Deletion metadata is allowed when it matches the canonical file operation."""
    assert inspect_patch_for_image(_deletion_patch(mode)) == ("src/old.ts",)


@pytest.mark.parametrize("mode", ("120000", "160000"))
def test_image_profile_rejects_symlink_and_gitlink_creation(mode: str) -> None:
    """Allowing create/delete does not admit symlinks or Git submodule objects."""
    with pytest.raises(ValueError, match="mode"):
        inspect_patch_for_image(_creation_patch(mode))
