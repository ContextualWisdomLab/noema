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


class MalformedContentsRunner(ContentsFailureRunner):
    """Return a syntactically invalid base64 payload for current-head contents."""

    def __call__(self, args, stdin=None):
        """Model provider corruption that permissive base64 decoding must not hide."""
        joined = " ".join(args)
        if "/contents/src/x.py" in joined:
            return "YWJj$\n"
        return super().__call__(args, stdin)


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


def test_malformed_base64_changed_file_is_retained_as_blocking_evidence_failure() -> None:
    """Provider-corrupted base64 must not be permissively decoded into trusted context."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=MalformedContentsRunner(),
    )

    assert manifest.changed_files[0].path == "src/x.py"
    assert manifest.changed_files[0].content == ""
    assert any(
        failure == "changed-file content src/x.py: invalid base64 current-head contents"
        for failure in manifest.evidence_failures
    )
