"""Path-identity regressions for Git patch preflight."""

from __future__ import annotations

import pytest

from noema_reviewer.patch_validation import inspect_patch_bytes


@pytest.mark.parametrize(
    "patch_bytes",
    (
        (
            b"diff --git a/src/declared.ts b/src/declared.ts\n"
            b"--- a/src/actual.ts\n"
            b"+++ b/src/declared.ts\n"
            b"@@ -1 +1 @@\n-old\n+new\n"
        ),
        (
            b"diff --git a/src/declared.ts b/src/declared.ts\n"
            b"--- a/src/declared.ts\n"
            b"+++ b/src/actual.ts\n"
            b"@@ -1 +1 @@\n-old\n+new\n"
        ),
        (
            b"diff --git a/src/old.ts b/src/new.ts\n"
            b"similarity index 100%\n"
            b"rename from src/other.ts\n"
            b"rename to src/new.ts\n"
        ),
        (
            b"diff --git a/src/old.ts b/src/new.ts\n"
            b"similarity index 100%\n"
            b"rename from src/old.ts\n"
            b"rename to src/other.ts\n"
        ),
        (
            b"diff --git a/src/old.ts b/src/new.ts\n"
            b"similarity index 100%\n"
            b"copy from src/other.ts\n"
            b"copy to src/new.ts\n"
        ),
        (
            b"diff --git a/src/old.ts b/src/new.ts\n"
            b"similarity index 100%\n"
            b"copy from src/old.ts\n"
            b"copy to src/other.ts\n"
        ),
    ),
)
def test_secondary_paths_must_match_primary_diff_identity(patch_bytes: bytes) -> None:
    """Auxiliary paths cannot redirect one counted diff entry to another safe file."""
    with pytest.raises(ValueError, match="does not match the primary diff path"):
        inspect_patch_bytes(patch_bytes)


@pytest.mark.parametrize(
    ("patch_bytes", "expected_target"),
    (
        (
            b"diff --git a/src/old.ts b/src/new.ts\n"
            b"similarity index 90%\n"
            b"rename from src/old.ts\n"
            b"rename to src/new.ts\n"
            b"--- a/src/old.ts\n"
            b"+++ b/src/new.ts\n"
            b"@@ -1 +1 @@\n-old\n+new\n",
            "src/new.ts",
        ),
        (
            b"diff --git a/src/new.ts b/src/new.ts\n"
            b"new file mode 100644\n"
            b"--- /dev/null\n"
            b"+++ b/src/new.ts\n"
            b"@@ -0,0 +1 @@\n+new\n",
            "src/new.ts",
        ),
        (
            b"diff --git a/src/old.ts b/src/old.ts\n"
            b"deleted file mode 100644\n"
            b"--- a/src/old.ts\n"
            b"+++ /dev/null\n"
            b"@@ -1 +0,0 @@\n-old\n",
            "src/old.ts",
        ),
    ),
)
def test_consistent_rename_create_and_delete_paths_are_accepted(
    patch_bytes: bytes,
    expected_target: str,
) -> None:
    """Canonical rename, creation, and deletion metadata remains supported."""
    assert inspect_patch_bytes(patch_bytes) == (expected_target,)
