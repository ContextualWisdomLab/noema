"""PEP 517 wrapper that stages the canonical noema-core package for distribution builds.

The reviewer cannot declare an immutable external ``noema-core`` dependency until
that package is published. Repository builds therefore stage the canonical
monorepo package into a build-only directory before delegating to setuptools.
The staged directory is included in source distributions so an extracted sdist
can build a wheel without access to the original monorepo checkout.
"""

from __future__ import annotations

from pathlib import Path
from shutil import copytree, rmtree
from typing import Any, Callable

from setuptools import build_meta as _setuptools

_PROJECT_ROOT = Path(__file__).resolve().parent
_CANONICAL_CORE = _PROJECT_ROOT.parent / "packages" / "noema-core" / "src" / "noema_core"
_STAGING_ROOT = _PROJECT_ROOT / "_build_include"
_STAGED_CORE = _STAGING_ROOT / "noema_core"


def _prepare_core() -> bool:
    """Ensure packaging reads one exact snapshot of the canonical core source.

    A monorepo checkout always recreates staging from the canonical source so a
    stale local staging directory cannot become package authority. An extracted
    source distribution has no sibling package checkout and therefore consumes
    the staged snapshot embedded by the source-distribution build.
    """

    if _CANONICAL_CORE.is_dir():
        if _STAGING_ROOT.exists():
            rmtree(_STAGING_ROOT)
        _STAGING_ROOT.mkdir(parents=True)
        copytree(_CANONICAL_CORE, _STAGED_CORE)
        return True
    if _STAGED_CORE.is_dir():
        return False
    raise RuntimeError("canonical noema-core source is unavailable for reviewer packaging")


def _with_core_staging(builder: Callable[..., str], *args: Any, **kwargs: Any) -> str:
    """Delegate a PEP 517 build while cleaning repository-only staging afterward."""

    created = _prepare_core()
    try:
        return builder(*args, **kwargs)
    finally:
        if created and _STAGING_ROOT.exists():
            rmtree(_STAGING_ROOT)


def build_wheel(
    wheel_directory: str,
    config_settings: dict[str, Any] | None = None,
    metadata_directory: str | None = None,
) -> str:
    """Build a reviewer wheel containing the staged canonical noema-core snapshot."""

    return _with_core_staging(
        _setuptools.build_wheel,
        wheel_directory,
        config_settings,
        metadata_directory,
    )


def build_sdist(
    sdist_directory: str,
    config_settings: dict[str, Any] | None = None,
) -> str:
    """Build a self-contained source distribution from canonical monorepo source."""

    return _with_core_staging(_setuptools.build_sdist, sdist_directory, config_settings)


def prepare_metadata_for_build_wheel(
    metadata_directory: str,
    config_settings: dict[str, Any] | None = None,
) -> str:
    """Prepare wheel metadata under the same package-discovery boundary as builds."""

    return _with_core_staging(
        _setuptools.prepare_metadata_for_build_wheel,
        metadata_directory,
        config_settings,
    )


def get_requires_for_build_wheel(
    config_settings: dict[str, Any] | None = None,
) -> list[str]:
    """Return setuptools wheel-build requirements without changing dependency policy."""

    return _setuptools.get_requires_for_build_wheel(config_settings)


def get_requires_for_build_sdist(
    config_settings: dict[str, Any] | None = None,
) -> list[str]:
    """Return setuptools sdist-build requirements without changing dependency policy."""

    return _setuptools.get_requires_for_build_sdist(config_settings)
