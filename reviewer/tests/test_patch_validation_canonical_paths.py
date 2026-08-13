"""Canonical repository-path regressions for patch preflight."""

from __future__ import annotations

import pytest

from noema_reviewer.patch_validation import inspect_patch_bytes


@pytest.mark.parametrize(
    "path",
    (
        "src//example.ts",
        "src/./example.ts",
        "src/example.ts/",
        ".",
    ),
)
def test_noncanonical_primary_paths_are_rejected(path: str) -> None:
    """Primary diff paths must not normalize to a different filesystem identity."""
    patch_bytes = (
        f"diff --git a/{path} b/{path}\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
    ).encode()

    with pytest.raises(ValueError, match="unsafe repository path"):
        inspect_patch_bytes(patch_bytes)


def test_canonical_path_with_spaces_remains_supported() -> None:
    """An exact quoted path with ordinary spaces remains a valid identity."""
    patch_bytes = (
        b'diff --git "a/src/file name.ts" "b/src/file name.ts"\n'
        b'--- "a/src/file name.ts"\n'
        b'+++ "b/src/file name.ts"\n'
    )

    assert inspect_patch_bytes(patch_bytes) == ("src/file name.ts",)


def test_unquoted_path_with_spaces_remains_supported() -> None:
    """Git's ordinary unquoted space-path headers remain a valid identity."""
    primary_marker = "diff" + " --" + "git"
    patch_bytes = (
        f"{primary_marker} a/src/file name.ts b/src/file name.ts\n"
        "--- a/src/file name.ts\n"
        "+++ b/src/file name.ts\n"
    ).encode()

    assert inspect_patch_bytes(patch_bytes) == ("src/file name.ts",)
