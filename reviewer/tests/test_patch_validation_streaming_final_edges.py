"""Final branch regressions for streamed exact-head and archive evidence."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation


def _install_source_preflight(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Install one successful isolated-control and read-tree preflight."""
    control = tmp_path / "isolated-control"
    control.mkdir()
    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        lambda *_args, **_kwargs: control,
    )
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0),
    )


def test_source_head_runtime_start_failure_has_no_process_to_terminate(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A runtime failure before process assignment is re-raised without cleanup."""
    _install_source_preflight(tmp_path, monkeypatch)
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: (_ for _ in ()).throw(RuntimeError("invalid stream")),
    )

    with pytest.raises(RuntimeError, match="invalid stream"):
        patch_validation._verify_source_head(
            tmp_path,
            "1" * 40,
            "directory",
        )


def test_exact_tree_value_failure_has_no_process_to_terminate(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A bounded-validation error before assignment still receives safe wrapping."""
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: (_ for _ in ()).throw(ValueError("invalid tree")),
    )

    with pytest.raises(RuntimeError, match="failed bounded validation"):
        patch_validation._verify_exact_tree_limits(tmp_path, "1" * 40)


def test_exact_tree_record_rejects_oversized_blob(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One blob above the source-file ceiling is rejected before archiving."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_ARCHIVE_MEMBER_BYTES", 0)
    record = f"100644 blob {'a' * 40} 1\tfixture.txt".encode()

    with pytest.raises(ValueError, match="member exceeds its byte limit"):
        patch_validation._validated_exact_tree_record(record, set(), 0)


def test_materialization_rejects_archive_command_failure_after_tree_preflight(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A nonzero archive command cannot yield a committed source snapshot."""
    source = tmp_path / "source-root"
    source.mkdir()
    staging = tmp_path / "staging-root"
    staging.mkdir()
    control = staging / "isolated-control"
    control.mkdir()
    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        lambda *_args, **_kwargs: control,
    )
    monkeypatch.setattr(
        patch_validation,
        "_verify_exact_tree_limits",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1),
    )

    with pytest.raises(RuntimeError, match="snapshot could not be materialized"):
        patch_validation._materialize_committed_source(
            source,
            "1" * 40,
            staging,
            "directory",
        )
