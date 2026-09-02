"""Regression tests for the shared-core import and distribution boundary."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


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
