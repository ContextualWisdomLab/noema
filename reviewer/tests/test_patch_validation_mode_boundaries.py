"""Git file-mode regressions for patch preflight."""

from __future__ import annotations

import pytest

from noema_reviewer.patch_validation import inspect_patch_bytes


@pytest.mark.parametrize("mode", ["120000", "160000"])
def test_existing_symlink_and_gitlink_index_modes_are_rejected(mode: str) -> None:
    """An existing special entry cannot bypass checks through an `index` header."""
    patch_bytes = (
        b"diff --git a/vendor/component b/vendor/component\n"
        + f"index {'1' * 40}..{'2' * 40} {mode}\n".encode()
        + b"--- a/vendor/component\n"
        + b"+++ b/vendor/component\n"
        + b"@@ -1 +1 @@\n"
        + b"-Subproject commit 1111111111111111111111111111111111111111\n"
        + b"+Subproject commit 2222222222222222222222222222222222222222\n"
    )

    with pytest.raises(ValueError, match="symlink or gitlink mode"):
        inspect_patch_bytes(patch_bytes)


def test_regular_index_mode_is_accepted() -> None:
    """A normal existing regular-file mode remains valid patch metadata."""
    patch_bytes = (
        b"diff --git a/src/example.ts b/src/example.ts\n"
        + f"index {'1' * 40}..{'2' * 40} 100644\n".encode()
        + b"--- a/src/example.ts\n"
        + b"+++ b/src/example.ts\n"
        + b"@@ -1 +1 @@\n"
        + b"-old\n"
        + b"+new\n"
    )

    assert inspect_patch_bytes(patch_bytes) == ("src/example.ts",)


def test_trailing_mode_tokens_cannot_hide_a_symlink_mode() -> None:
    """A Git-tolerated trailing token cannot hide a symlink creation mode."""
    patch_bytes = (
        b"diff --git a/link b/link\n"
        b"new file mode 120000 100644\n"
        b"index 0000000..ce01362\n"
        b"--- /dev/null\n"
        b"+++ b/link\n"
        b"@@ -0,0 +1 @@\n"
        b"+target\n"
    )

    with pytest.raises(ValueError, match="malformed mode metadata"):
        inspect_patch_bytes(patch_bytes)
