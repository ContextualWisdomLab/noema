"""Regression tests for bounded changed-file evidence collection."""

from __future__ import annotations

import base64
import json

from noema_reviewer.gating import missing_evidence
from noema_reviewer.github_io import (
    MAX_CODEGRAPH_CHANGED_SCOPE_FILES,
    MAX_CONTEXT_FILES,
    fetch_manifest,
)

HEAD_SHA = "a" * 40
BASE_SHA = "b" * 40


class ManyFilesRunner:
    """Return a complete PR with a caller-selected changed-file inventory."""

    def __init__(self, file_count: int) -> None:
        """Retain the exact number of changed paths emitted by the files endpoint."""
        self.file_count = file_count

    def __call__(self, args, stdin=None):
        """Return deterministic GitHub API evidence for a large pull request."""
        joined = " ".join(args)
        if "Accept: application/vnd.github.v3.diff" in joined:
            return "diff --git a/src/file_0.py b/src/file_0.py\n+bounded"
        if "{title: .title" in joined:
            return json.dumps(
                {"title": "large PR", "head": HEAD_SHA, "base": BASE_SHA, "state": "open"}
            )
        if "/files" in joined:
            return "\n".join(
                json.dumps(f"src/file_{index}.py")
                for index in range(self.file_count)
            )
        if "/contents/" in joined:
            return base64.b64encode(b"print('bounded')").decode("ascii")
        if "/check-runs" in joined:
            if "select(.conclusion" in joined:
                return ""
            return json.dumps({"name": "ci", "conclusion": "success"})
        if " api graphql " in f" {joined} ":
            return ""
        if "/reviews" in joined or "/issues/1/comments" in joined:
            return ""
        if "/code-scanning/alerts" in joined or "/dependabot/alerts" in joined:
            return ""
        return ""


def _codegraph_runner(args, source_root):
    """Return stable CodeGraph evidence without running an external process."""
    return "Index is up to date"


def _manifest(file_count: int):
    """Collect one deterministic manifest with the requested changed-file count."""
    return fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=ManyFilesRunner(file_count),
        source_root="/target",
        codegraph_runner=_codegraph_runner,
    )


def test_manifest_retains_complete_context_within_canonical_changed_scope() -> None:
    """A reviewable 13-file PR must not be blocked by the historical 12-file context cap."""
    manifest = _manifest(13)

    assert MAX_CODEGRAPH_CHANGED_SCOPE_FILES >= 13
    assert len(manifest.changed_files) == 13
    assert not any(
        failure.startswith("changed-file context:")
        for failure in manifest.evidence_failures
    )


def test_strict_manifest_records_context_truncation_above_canonical_scope() -> None:
    """A PR above the canonical 80-file scope still fails closed on omitted context."""
    file_count = MAX_CODEGRAPH_CHANGED_SCOPE_FILES + 1
    manifest = _manifest(file_count)

    assert MAX_CONTEXT_FILES == MAX_CODEGRAPH_CHANGED_SCOPE_FILES
    assert len(manifest.changed_files) == MAX_CODEGRAPH_CHANGED_SCOPE_FILES
    assert any(
        f"collected {file_count} files" in failure
        and f"retains {MAX_CODEGRAPH_CHANGED_SCOPE_FILES}" in failure
        for failure in manifest.evidence_failures
    )
    assert any(
        "changed-file context" in reason for reason in missing_evidence(manifest)
    )
