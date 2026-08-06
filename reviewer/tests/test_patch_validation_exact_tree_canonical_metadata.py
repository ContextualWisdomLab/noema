"""Canonical exact-tree metadata regressions for the patch-validation boundary."""

from __future__ import annotations

import pytest

from noema_reviewer import patch_validation


@pytest.mark.parametrize(
    ("metadata", "message"),
    (
        (f"100644  blob {'a' * 40} 1", "malformed metadata"),
        (f"100644\u00a0blob {'a' * 40} 1", "malformed metadata"),
        (f"100644 blob {'a' * 40}  1", "malformed metadata"),
        (f"100644 blob {'a' * 40}        1", "malformed metadata"),
        (f"100644 blob {'a' * 40} \u0661", "invalid blob size"),
        (f"100644 blob {'a' * 40} 1x", "invalid blob size"),
    ),
)
def test_exact_tree_metadata_requires_canonical_ascii_fields(
    metadata: str,
    message: str,
) -> None:
    """Unicode digits or noncanonical separators cannot masquerade as Git metadata."""
    record = f"{metadata}\tfixture.txt".encode("utf-8")

    with pytest.raises(ValueError, match=message):
        patch_validation._validated_exact_tree_record(record, set(), 0)


@pytest.mark.parametrize(
    ("raw_size", "expected_size"),
    (
        ("1", 1),
        ("      1", 1),
        ("     10", 10),
        ("1234567", 1_234_567),
    ),
)
def test_exact_tree_metadata_accepts_git_ascii_size_forms(
    raw_size: str,
    expected_size: int,
) -> None:
    """Unpadded fixtures and Git's exact minimum-width padding remain supported."""
    record = f"100644 blob {'a' * 40} {raw_size}\tfixture.txt".encode("ascii")

    assert (
        patch_validation._validated_exact_tree_record(record, set(), 0)
        == expected_size
    )
