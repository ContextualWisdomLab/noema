"""Fail-closed regression for changed-file evidence collection."""

from __future__ import annotations

import json

from noema_reviewer.github_io import fetch_manifest


HEAD_SHA = "a" * 40
BASE_SHA = "b" * 40


class ContentsFailureRunner:
    """Return valid review evidence except for current-head file contents."""

    def __call__(self, args, stdin=None):
        """Model one exact changed-file contents endpoint failure."""
        joined = " ".join(args)
        if "Accept: application/vnd.github.v3.diff" in joined:
            return "diff --git a/src/x.py b/src/x.py\n+new line"
        if "{title: .title" in joined:
            return json.dumps(
                {"title": "PR title", "head": HEAD_SHA, "base": BASE_SHA, "state": "open"}
            )
        if "/files" in joined:
            return "src/x.py\n"
        if "/contents/src/x.py" in joined:
            raise RuntimeError("contents endpoint unavailable")
        if "/check-runs" in joined:
            return ""
        if " api graphql " in f" {joined} ":
            return ""
        if "/reviews" in joined or "/comments" in joined:
            return ""
        if "/code-scanning/alerts" in joined or "/dependabot/alerts" in joined:
            return ""
        return ""


def test_changed_file_fetch_failure_is_retained_as_blocking_evidence_failure() -> None:
    """Missing current-head file context must never become a silent empty file."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=ContentsFailureRunner(),
    )

    assert manifest.changed_files[0].path == "src/x.py"
    assert manifest.changed_files[0].content == ""
    assert any(
        failure.startswith("changed-file content src/x.py: contents endpoint unavailable")
        for failure in manifest.evidence_failures
    )
