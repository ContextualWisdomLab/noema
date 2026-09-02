"""Regression coverage for isolated reviewer build staging and editable source lifetime."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
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


def test_distribution_build_does_not_destroy_editable_canonical_view(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """A distribution build must not remove the source view used by an editable install."""

    if not build_backend._CANONICAL_CORE.is_dir():
        return

    build_backend._prepare_editable_core()
    editable_view = build_backend._STAGED_CORE
    assert editable_view.is_symlink()
    assert editable_view.resolve() == build_backend._CANONICAL_CORE.resolve()

    observed_projects: list[Path] = []

    def fake_build_wheel(wheel_directory: str, *_args, **_kwargs) -> str:
        project_root = Path.cwd()
        observed_projects.append(project_root)
        assert project_root != build_backend._PROJECT_ROOT
        assert (project_root / "_build_include" / "noema_core").is_dir()
        assert Path(wheel_directory) == tmp_path.resolve()
        return "noema_reviewer-0.1.0-py3-none-any.whl"

    monkeypatch.setattr(build_backend._setuptools, "build_wheel", fake_build_wheel)
    try:
        assert build_backend.build_wheel(str(tmp_path)) == "noema_reviewer-0.1.0-py3-none-any.whl"
        assert observed_projects
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
