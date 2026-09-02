"""Regression coverage for the reviewer packaging backend's editable-install contract."""

from __future__ import annotations

import build_backend


def test_build_backend_exposes_pep660_editable_hooks() -> None:
    """The custom backend must preserve setuptools' documented editable-install path."""

    for hook_name in (
        "build_editable",
        "prepare_metadata_for_build_editable",
        "get_requires_for_build_editable",
    ):
        assert callable(getattr(build_backend, hook_name, None)), hook_name
