"""Regression tests for the shared-core import and distribution boundary."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

import pytest

import noema_reviewer


def test_evidence_modules_import_without_shared_core_on_pythonpath() -> None:
    """Evidence-only reviewer imports must not require the model-construction package."""

    reviewer_root = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["PYTHONPATH"] = "."
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; sys.modules['noema_core'] = None; "
                "from noema_reviewer.github_io import fetch_manifest; "
                "from noema_reviewer.sandbox import DockerCodeGraphRunner; "
                "assert fetch_manifest is not None; "
                "assert DockerCodeGraphRunner is not None"
            ),
        ],
        cwd=reviewer_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr


def test_agent_exports_remain_available_from_package_root() -> None:
    """Lazy loading must preserve the existing package-level agent API."""

    assert noema_reviewer.build_agent is not None
    assert noema_reviewer.ReviewAgent is not None
    assert noema_reviewer.PydanticAIReviewAgent is not None


def test_unknown_package_export_fails_normally() -> None:
    """Unknown package attributes must still raise the standard error."""

    with pytest.raises(AttributeError, match="has no attribute"):
        getattr(noema_reviewer, "missing_runtime_export")
