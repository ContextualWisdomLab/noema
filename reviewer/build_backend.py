"""PEP 517/660 wrapper that stages canonical noema-core for reviewer builds.

The reviewer cannot declare an immutable external ``noema-core`` dependency until
that package is published. Distribution hooks therefore build from a private
per-invocation copy of the reviewer project containing one canonical noema-core
snapshot. Editable hooks keep one ignored symlink to canonical monorepo source,
so distribution cleanup cannot invalidate an existing editable installation.
"""

from __future__ import annotations

from contextlib import contextmanager
import json
from pathlib import Path
from shutil import copytree, ignore_patterns, rmtree
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import RLock
from typing import Any, Callable, Iterator, TypeVar, cast

from setuptools import build_meta as _setuptools

_PROJECT_ROOT = Path(__file__).resolve().parent
_CANONICAL_CORE = _PROJECT_ROOT.parent / "packages" / "noema-core" / "src" / "noema_core"
_STAGING_ROOT = _PROJECT_ROOT / "_build_include"
_STAGED_CORE = _STAGING_ROOT / "noema_core"
_EDITABLE_BUILD_LOCK = RLock()
_BUILD_RESULT = TypeVar("_BUILD_RESULT")
_STAGED_BACKEND_PROGRAM = """
from __future__ import annotations

import importlib
import json
from pathlib import Path
import sys

hook_name, result_path, args_payload, kwargs_payload = sys.argv[1:]
backend = importlib.import_module("setuptools.build_meta")
result = getattr(backend, hook_name)(
    *json.loads(args_payload),
    **json.loads(kwargs_payload),
)
Path(result_path).write_text(json.dumps(result), encoding="utf-8")
"""


def _remove_generated_path(path: Path) -> None:
    """Remove a generated file, symlink, or directory without following links."""

    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
    elif path.exists():
        rmtree(path)


def _reset_staging_root() -> None:
    """Recreate the editable package view without following stale path aliases."""

    _remove_generated_path(_STAGING_ROOT)
    _STAGING_ROOT.mkdir(parents=True)


def _prepare_editable_core() -> None:
    """Expose canonical noema-core to editable installs through a live source link.

    Editable packaging must never fall back to a copied snapshot because such a
    copy silently stops reflecting edits to the canonical Shared Kernel. A host
    that cannot create the directory link fails explicitly instead.
    """

    if not _CANONICAL_CORE.is_dir():
        if _STAGED_CORE.is_dir():
            return
        raise RuntimeError("canonical noema-core source is unavailable for reviewer editable install")

    if _STAGED_CORE.is_symlink():
        try:
            if _STAGED_CORE.resolve(strict=True) == _CANONICAL_CORE.resolve(strict=True):
                return
        except OSError:
            pass

    _reset_staging_root()
    try:
        _STAGED_CORE.symlink_to(_CANONICAL_CORE, target_is_directory=True)
    except OSError as error:
        _remove_generated_path(_STAGING_ROOT)
        raise RuntimeError(
            "reviewer editable install requires a live symlink to canonical noema-core source"
        ) from error


def _distribution_source_core() -> Path:
    """Return the canonical or embedded noema-core source used for a distribution."""

    if _CANONICAL_CORE.is_dir():
        return _CANONICAL_CORE
    if _STAGED_CORE.is_dir():
        return _STAGED_CORE
    raise RuntimeError("canonical noema-core source is unavailable for reviewer packaging")


@contextmanager
def _distribution_project() -> Iterator[Path]:
    """Yield a private reviewer project containing one exact shared-core snapshot.

    The caller gets a distinct filesystem tree for each invocation. This keeps
    concurrent wheel, sdist, metadata, and requirement hooks from deleting or
    overwriting one another's package staging.
    """

    source_core = _distribution_source_core()
    with TemporaryDirectory(prefix="noema-reviewer-build-") as temporary_root:
        project_root = Path(temporary_root) / "reviewer"
        copytree(
            _PROJECT_ROOT,
            project_root,
            ignore=ignore_patterns(
                "_build_include",
                "__pycache__",
                ".pytest_cache",
                "*.egg-info",
                "build",
                "dist",
            ),
        )
        staged_core = project_root / "_build_include" / "noema_core"
        staged_core.parent.mkdir(parents=True, exist_ok=True)
        copytree(source_core, staged_core, symlinks=False)
        yield project_root


def _run_distribution_hook(
    hook_name: str,
    *args: Any,
    **kwargs: Any,
) -> _BUILD_RESULT:
    """Invoke setuptools in a fresh process whose project root is the staged copy.

    ``setuptools.build_meta`` is project-context-sensitive. Reusing the module
    imported for the checkout after merely changing process cwd can retain the
    wrong distribution identity and emit ``UNKNOWN-0.0.0`` artifacts. A child
    interpreter imports the public backend only after entering the private
    staged project, while also allowing independent build invocations to run
    concurrently without shared cwd or module state.
    """

    with _distribution_project() as project_root:
        result_path = project_root.parent / "backend-result.json"
        subprocess.run(
            [
                sys.executable,
                "-c",
                _STAGED_BACKEND_PROGRAM,
                hook_name,
                str(result_path),
                json.dumps(args),
                json.dumps(kwargs),
            ],
            cwd=project_root,
            check=True,
        )
        if not result_path.is_file():
            raise RuntimeError(f"staged setuptools hook {hook_name!r} produced no result")
        return cast(_BUILD_RESULT, json.loads(result_path.read_text(encoding="utf-8")))


def _with_editable_core(
    builder: Callable[..., _BUILD_RESULT],
    *args: Any,
    **kwargs: Any,
) -> _BUILD_RESULT:
    """Run an editable hook while retaining its live canonical source view."""

    with _EDITABLE_BUILD_LOCK:
        _prepare_editable_core()
        return builder(*args, **kwargs)


def _absolute_path(path: str | None) -> str | None:
    """Preserve frontend output-directory identity across private-project builds."""

    if path is None:
        return None
    return str(Path(path).resolve())


def build_wheel(
    wheel_directory: str,
    config_settings: dict[str, Any] | None = None,
    metadata_directory: str | None = None,
) -> str:
    """Build a reviewer wheel containing the staged canonical noema-core snapshot."""

    return _run_distribution_hook(
        "build_wheel",
        _absolute_path(wheel_directory),
        config_settings,
        _absolute_path(metadata_directory),
    )


def build_editable(
    wheel_directory: str,
    config_settings: dict[str, Any] | None = None,
    metadata_directory: str | None = None,
) -> str:
    """Build an editable reviewer wheel against the canonical shared-core source."""

    return _with_editable_core(
        _setuptools.build_editable,
        _absolute_path(wheel_directory),
        config_settings,
        _absolute_path(metadata_directory),
    )


def build_sdist(
    sdist_directory: str,
    config_settings: dict[str, Any] | None = None,
) -> str:
    """Build a self-contained source distribution from canonical monorepo source."""

    return _run_distribution_hook(
        "build_sdist",
        _absolute_path(sdist_directory),
        config_settings,
    )


def prepare_metadata_for_build_wheel(
    metadata_directory: str,
    config_settings: dict[str, Any] | None = None,
) -> str:
    """Prepare wheel metadata in a backend imported from the staged project root."""

    return _run_distribution_hook(
        "prepare_metadata_for_build_wheel",
        _absolute_path(metadata_directory),
        config_settings,
    )


def prepare_metadata_for_build_editable(
    metadata_directory: str,
    config_settings: dict[str, Any] | None = None,
) -> str:
    """Prepare editable metadata against the canonical shared-core source view."""

    return _with_editable_core(
        _setuptools.prepare_metadata_for_build_editable,
        _absolute_path(metadata_directory),
        config_settings,
    )


def get_requires_for_build_wheel(
    config_settings: dict[str, Any] | None = None,
) -> list[str]:
    """Return wheel-build requirements from a staged-project backend context."""

    return _run_distribution_hook("get_requires_for_build_wheel", config_settings)


def get_requires_for_build_editable(
    config_settings: dict[str, Any] | None = None,
) -> list[str]:
    """Return editable requirements after validating canonical package availability."""

    return _with_editable_core(_setuptools.get_requires_for_build_editable, config_settings)


def get_requires_for_build_sdist(
    config_settings: dict[str, Any] | None = None,
) -> list[str]:
    """Return sdist-build requirements from a staged-project backend context."""

    return _run_distribution_hook("get_requires_for_build_sdist", config_settings)
