"""Regression coverage for isolated reviewer build staging and editable source lifetime."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import threading

import pytest

import build_backend


def test_distribution_staging_is_private_per_build_invocation() -> None:
    """Concurrent distribution preparations must never share a mutable staging tree."""

    barrier = threading.Barrier(2)

    def observe_distribution_project() -> tuple[Path, Path]:
        with build_backend._distribution_project() as project_root:
            staged_core = project_root / "_build_include" / "noema_core"
            assert staged_core.is_dir()
            barrier.wait(timeout=10)
            return project_root, staged_core

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(observe_distribution_project)
        second = pool.submit(observe_distribution_project)
        first_project, first_core = first.result(timeout=20)
        second_project, second_core = second.result(timeout=20)

    assert first_project != second_project
    assert first_core != second_core


def test_concurrent_distribution_metadata_keeps_reviewer_project_identity(tmp_path: Path) -> None:
    """Fresh backend contexts must emit reviewer metadata, never UNKNOWN artifacts."""

    def prepare_metadata(index: int) -> tuple[str, bool]:
        metadata_root = tmp_path / f"metadata-{index}"
        metadata_root.mkdir()
        distribution_name = build_backend.prepare_metadata_for_build_wheel(str(metadata_root))
        return distribution_name, (metadata_root / distribution_name).is_dir()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(prepare_metadata, (1, 2)))

    for distribution_name, exists in results:
        assert distribution_name.startswith("noema_reviewer-")
        assert distribution_name.endswith(".dist-info")
        assert exists


def test_distribution_hook_preserves_frontend_backend_environment(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """A staged child must retain the PEP 517 frontend's isolated backend search path."""

    isolated_backend_path = str(tmp_path / "pep517-overlay-site-packages")
    monkeypatch.setattr(
        build_backend.sys,
        "path",
        [isolated_backend_path, *build_backend.sys.path],
    )
    observed: dict[str, object] = {}

    def fake_run(command, *, cwd, check, env) -> None:
        observed["cwd"] = cwd
        observed["check"] = check
        observed["env"] = env
        Path(command[4]).write_text(
            json.dumps("noema_reviewer-0.1.0.dist-info"),
            encoding="utf-8",
        )

    monkeypatch.setattr(build_backend.subprocess, "run", fake_run)
    metadata_root = tmp_path / "metadata"
    metadata_root.mkdir()

    result = build_backend.prepare_metadata_for_build_wheel(str(metadata_root))

    assert result == "noema_reviewer-0.1.0.dist-info"
    assert observed["check"] is True
    child_env = observed["env"]
    assert isinstance(child_env, dict)
    child_pythonpath = child_env["PYTHONPATH"].split(os.pathsep)
    assert child_pythonpath[0] == str(observed["cwd"])
    assert isolated_backend_path in child_pythonpath


def test_distribution_build_does_not_destroy_editable_canonical_view(tmp_path: Path) -> None:
    """A real distribution build must not remove the source view used by an editable install."""

    if not build_backend._CANONICAL_CORE.is_dir():
        return

    build_backend._prepare_editable_core()
    editable_view = build_backend._STAGED_CORE
    assert editable_view.is_symlink()
    assert editable_view.resolve() == build_backend._CANONICAL_CORE.resolve()

    wheel_root = tmp_path / "wheel"
    wheel_root.mkdir()
    try:
        wheel_name = build_backend.build_wheel(str(wheel_root))
        assert wheel_name.startswith("noema_reviewer-")
        assert (wheel_root / wheel_name).is_file()
        assert editable_view.is_symlink()
        assert editable_view.resolve() == build_backend._CANONICAL_CORE.resolve()
    finally:
        build_backend._remove_generated_path(build_backend._STAGING_ROOT)


def test_generated_path_cleanup_unlinks_files_and_symlinks(tmp_path: Path) -> None:
    """Generated cleanup must unlink leaf capabilities instead of passing them to rmtree."""

    regular_file = tmp_path / "regular-file"
    regular_file.write_text("generated", encoding="utf-8")
    build_backend._remove_generated_path(regular_file)
    assert not regular_file.exists()

    target = tmp_path / "target"
    target.mkdir()
    alias = tmp_path / "alias"
    alias.symlink_to(target, target_is_directory=True)
    build_backend._remove_generated_path(alias)
    assert not alias.exists()
    assert target.is_dir()


def test_editable_source_view_fails_closed_when_live_link_cannot_be_created(
    monkeypatch,
) -> None:
    """Editable packaging must not replace a failed live link with a stale copied snapshot."""

    if not build_backend._CANONICAL_CORE.is_dir():
        return

    build_backend._remove_generated_path(build_backend._STAGING_ROOT)

    def deny_symlink(*_args, **_kwargs) -> None:
        raise OSError("symlink unavailable")

    monkeypatch.setattr(Path, "symlink_to", deny_symlink)
    with pytest.raises(RuntimeError, match="requires a live symlink"):
        build_backend._prepare_editable_core()
    assert not build_backend._STAGING_ROOT.exists()
