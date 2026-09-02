"""Regression coverage for the reviewer packaging backend's editable-install contract."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

import build_backend


def test_build_backend_exposes_pep660_editable_hooks() -> None:
    """The custom backend must preserve setuptools' documented editable-install path."""

    for hook_name in (
        "build_editable",
        "prepare_metadata_for_build_editable",
        "get_requires_for_build_editable",
    ):
        assert callable(getattr(build_backend, hook_name, None)), hook_name


def test_clean_editable_install_imports_reviewer_and_canonical_core(tmp_path: Path) -> None:
    """An editable reviewer install must retain access to the canonical shared core."""

    reviewer_root = Path(__file__).resolve().parents[1]
    venv_dir = tmp_path / "editable-venv"
    subprocess.run(
        [sys.executable, "-m", "venv", "--system-site-packages", str(venv_dir)],
        check=True,
    )
    python = venv_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    env = os.environ.copy()
    env["PYTHONPATH"] = ""
    subprocess.run(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "--no-deps",
            "--no-build-isolation",
            "-e",
            str(reviewer_root),
        ],
        cwd=tmp_path,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    completed = subprocess.run(
        [
            str(python),
            "-c",
            "import noema_core, noema_reviewer; assert noema_core.build_agent; assert noema_reviewer.build_agent",
        ],
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr


def test_reviewer_ci_proves_an_isolated_editable_install_with_locked_dependencies() -> None:
    """Required CI must validate editable packaging without inheriting host site-packages."""

    reviewer_root = Path(__file__).resolve().parents[1]
    workflow = (reviewer_root.parent / ".github" / "workflows" / "reviewer-ci.yml").read_text(
        encoding="utf-8"
    )

    assert 'editable_venv="$RUNNER_TEMP/noema-reviewer-editable-smoke"' in workflow
    assert 'python -m venv "$editable_venv"' in workflow
    assert (
        '"$editable_venv/bin/python" -m pip install --require-hashes --no-deps '
        '-r requirements-ci-hashes.txt'
    ) in workflow
    assert (
        '"$editable_venv/bin/python" -m pip install --no-deps --no-build-isolation -e .'
    ) in workflow
    assert '--system-site-packages "$editable_venv"' not in workflow
