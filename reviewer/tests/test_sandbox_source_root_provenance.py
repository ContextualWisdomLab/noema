"""Regression tests for production CodeGraph checkout-root provenance."""

from __future__ import annotations

import os

import pytest

from noema_reviewer.sandbox import DockerCodeGraphRunner


def test_runner_rejects_symlinked_source_root_before_buffering(tmp_path) -> None:
    """A source-root alias must not redirect the production sandbox bind mount."""
    physical = tmp_path / "physical-checkout"
    physical.mkdir()
    alias = tmp_path / "checkout-alias"
    alias.symlink_to(physical, target_is_directory=True)

    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    with pytest.raises(RuntimeError, match="physical source root"):
        runner(["codegraph", "init", "-i"], str(alias))


def test_runner_rejects_source_root_with_symlinked_ancestor(tmp_path) -> None:
    """A physical leaf below a symlinked ancestor is not physical checkout authority."""
    physical_parent = tmp_path / "physical-parent"
    physical_parent.mkdir()
    checkout = physical_parent / "checkout"
    checkout.mkdir()
    parent_alias = tmp_path / "parent-alias"
    parent_alias.symlink_to(physical_parent, target_is_directory=True)
    aliased_checkout = parent_alias / "checkout"

    assert os.path.isdir(aliased_checkout)
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    with pytest.raises(RuntimeError, match="physical source root"):
        runner(["codegraph", "init", "-i"], str(aliased_checkout))
