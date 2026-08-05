"""Narrow fixtures that isolate legacy unit targets from newer trust boundaries."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from noema_reviewer import patch_validation


_LEGACY_RUNNER_TESTS = frozenset(
    {
        "test_runner_launches_hardened_container_and_accepts_matching_result",
        "test_runner_rejects_result_bound_to_another_head",
        "test_runner_rejects_invalid_structured_evidence",
        "test_runner_cleans_up_container_after_timeout",
        "test_runner_bounds_nonzero_exit_diagnostics",
        "test_runner_uses_default_subprocess_path_when_not_injected",
        "test_runner_stages_docker_ambiguous_original_patch_path",
        "test_runner_rejects_oversized_result_file",
        "test_runner_mounts_only_one_size_limited_result_file",
    }
)
_LEGACY_STDOUT_RESULT_TESTS = frozenset(
    {
        "test_runner_launches_hardened_container_and_accepts_matching_result",
        "test_runner_rejects_result_bound_to_another_head",
        "test_runner_rejects_invalid_structured_evidence",
        "test_runner_uses_default_subprocess_path_when_not_injected",
    }
)


def _original_test_name(request: pytest.FixtureRequest) -> str:
    """Return one test name without a parameterization suffix."""
    return str(getattr(request.node, "originalname", None) or request.node.name)


@pytest.fixture(autouse=True)
def isolate_legacy_runner_unit_targets(
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Isolate downstream Docker-command tests from independently tested provenance."""
    test_name = _original_test_name(request)
    if test_name not in _LEGACY_RUNNER_TESTS:
        return

    monkeypatch.setattr(
        patch_validation,
        "_git_metadata_kind",
        lambda _source: "directory",
    )
    monkeypatch.setattr(
        patch_validation,
        "_verify_source_head",
        lambda _source, _head_sha, _metadata_kind: None,
    )
    monkeypatch.setattr(
        patch_validation,
        "_materialize_committed_source",
        lambda source, _head_sha, _staging_root, _metadata_kind: source,
    )

    if test_name not in _LEGACY_STDOUT_RESULT_TESTS:
        return
    production_reader = patch_validation._read_result_payload

    def read_legacy_result(
        result_path: Path,
        completed: Any = None,
        **kwargs: Any,
    ) -> bytes:
        """Adapt historical stdout fixtures without restoring a production channel."""
        stdout = getattr(completed, "stdout", "") if completed is not None else ""
        if stdout:
            return str(stdout).encode("utf-8")
        return production_reader(result_path, completed, **kwargs)

    monkeypatch.setattr(patch_validation, "_read_result_payload", read_legacy_result)


@pytest.fixture(autouse=True)
def isolate_archive_parser_unit_targets(
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Let archive-shape tests exercise tar parsing without constructing Git objects."""
    module_name = str(getattr(request.module, "__name__", ""))
    test_name = _original_test_name(request)
    archive_target = module_name.endswith("test_patch_validation_archive_boundaries")
    invalid_archive_target = test_name == "test_snapshot_materialization_rejects_invalid_archive"
    if not archive_target and not invalid_archive_target:
        return

    control = tmp_path / "isolated-archive-test-control"
    control.mkdir(exist_ok=True)
    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        lambda *_args, **_kwargs: control,
    )
