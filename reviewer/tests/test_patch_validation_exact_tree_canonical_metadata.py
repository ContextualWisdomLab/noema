"""Canonical exact-tree metadata regressions for the patch-validation boundary."""

from __future__ import annotations

import pytest

from noema_reviewer import patch_validation


@pytest.mark.parametrize(
    ("metadata", "message"),
    (
        (f"100644  blob {'a' * 40} 1", "malformed metadata"),
        (f"100644\u00a0blob {'a' * 40} 1", "malformed metadata"),
        (f"100644 blob {'a' * 40} \u0661", "invalid blob size"),
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


def test_exact_tree_metadata_accepts_one_canonical_ascii_record() -> None:
    """The exact six-mode, blob, object-id, size grammar remains supported."""
    record = f"100644 blob {'a' * 40} 1\tfixture.txt".encode("ascii")

    assert patch_validation._validated_exact_tree_record(record, set(), 0) == 1


def test_exact_tree_metadata_accepts_git_padded_ascii_size() -> None:
    """Real `git ls-tree -l` size padding remains valid canonical output."""
    record = f"100644 blob {'a' * 40}      10\tfixture.txt".encode("ascii")

    assert patch_validation._validated_exact_tree_record(record, set(), 0) == 10
