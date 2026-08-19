"""Regression tests for bounded changed-file evidence collection."""

from __future__ import annotations

import base64
import json

from noema_reviewer.gating import missing_evidence
from noema_reviewer.github_io import MAX_CONTEXT_FILES, fetch_manifest

HEAD_SHA = "a" * 40
BASE_SHA = "b" * 40


class ManyFilesRunner:
    """Return a complete PR whose changed-file list exceeds the manifest bound."""

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
                for index in range(MAX_CONTEXT_FILES + 1)
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


def test_strict_manifest_records_changed_file_context_truncation() -> None:
    """A PR with omitted changed-file contents cannot silently pass strict review."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=ManyFilesRunner(),
        source_root="/target",
        codegraph_runner=_codegraph_runner,
    )

    assert len(manifest.changed_files) == MAX_CONTEXT_FILES
    assert any(
        f"collected {MAX_CONTEXT_FILES + 1} files" in failure
        and f"retains {MAX_CONTEXT_FILES}" in failure
        for failure in manifest.evidence_failures
    )
    assert any(
        "changed-file context" in reason for reason in missing_evidence(manifest)
    )
