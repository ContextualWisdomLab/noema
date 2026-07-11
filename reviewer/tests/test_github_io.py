"""Tests for the injectable GitHub I/O layer."""

from __future__ import annotations

import base64
import json

import pytest

from noema_reviewer.github_io import (
    _fetch_check_conclusions,
    _truncate,
    default_runner,
    fetch_manifest,
    publish_verdict,
    render_review_body,
)
from noema_reviewer.models import Confidence, Finding, ReviewVerdict, Severity, Verdict


def _b64(text: str) -> str:
    """Return base64-encoded text as the contents API would."""
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


class StubRunner:
    """A ``gh`` runner stub that dispatches by the API path in the args."""

    def __init__(self, *, fail_contents: bool = False) -> None:
        """Record whether the contents endpoint should raise."""
        self.fail_contents = fail_contents
        self.calls: list[list[str]] = []

    def __call__(self, args, stdin=None):
        """Return canned responses keyed by the requested endpoint."""
        self.calls.append(list(args))
        joined = " ".join(args)
        if "Accept: application/vnd.github.v3.diff" in joined:
            return "diff --git a/x b/x\n+new line"
        if joined.endswith("/base}") or "{title: .title" in joined:
            return json.dumps({"title": "PR title", "head": "headsha", "base": "basesha"})
        if "/files" in joined:
            return "x.py\ny.py\n"
        if "/contents/" in joined:
            if self.fail_contents:
                raise RuntimeError("Command failed (1): gh")
            if "x.py" in joined:
                return _b64("print('x')")
            return ""
        if "/check-runs" in joined:
            return json.dumps({"name": "ci", "conclusion": "success"}) + "\n\n"
        if "/comments" in joined:
            return json.dumps({"author": "bob", "path": "x.py", "line": 3, "body": "nit"}) + "\n\n"
        return ""


def test_truncate_returns_short_text_unchanged() -> None:
    """Text within the budget is returned unchanged."""
    assert _truncate("short", 100) == "short"


def test_truncate_marks_long_text() -> None:
    """Text over the budget is cut with an explicit truncation note."""
    result = _truncate("x" * 20, 5)
    assert result.startswith("xxxxx")
    assert "truncated 15 characters" in result


def test_fetch_check_conclusions_empty_without_head_sha() -> None:
    """No head SHA yields no check conclusions."""
    assert _fetch_check_conclusions("o/r", "", StubRunner()) == []


def test_default_runner_returns_stdout() -> None:
    """The default runner returns stdout for a successful command."""
    assert default_runner(["printf", "hello"], None) == "hello"


def test_default_runner_raises_on_failure() -> None:
    """The default runner raises a RuntimeError on a non-zero exit."""
    with pytest.raises(RuntimeError):
        default_runner(["false"], None)


def test_fetch_manifest_builds_bounded_manifest() -> None:
    """fetch_manifest assembles diff, files, checks, and comments."""
    runner = StubRunner()
    manifest = fetch_manifest("o/r", 5, runner=runner)
    assert manifest.head_sha == "headsha"
    assert manifest.title == "PR title"
    assert [file.path for file in manifest.changed_files] == ["x.py", "y.py"]
    assert manifest.changed_files[0].content == "print('x')"
    assert manifest.changed_files[1].content == ""
    assert manifest.check_conclusions[0].conclusion == "success"
    assert manifest.review_comments[0].author == "bob"


def test_fetch_changed_file_survives_contents_error() -> None:
    """A contents API failure yields empty content, not a crash."""
    manifest = fetch_manifest("o/r", 5, runner=StubRunner(fail_contents=True))
    assert all(file.content == "" for file in manifest.changed_files)


def test_render_review_body_marks_findings_and_marker() -> None:
    """The rendered body lists findings and carries the interop marker."""
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="please fix",
        findings=[Finding(severity=Severity.HIGH, path="x.py", line=3, evidence="log", recommendation="bump")],
        confidence=Confidence.MEDIUM,
    )
    body = render_review_body(verdict, "headsha", "NOEMA_REVIEW_TOKEN")
    assert "[high] x.py:3" in body
    assert "<!-- noema-review-gate head_sha=headsha decision=request_changes -->" in body
    assert "Result: REQUEST_CHANGES" in body


def test_render_review_body_handles_blocked_reasons() -> None:
    """A blocked verdict renders its blocked reasons and no-findings default."""
    verdict = ReviewVerdict(
        verdict=Verdict.BLOCKED,
        summary="missing evidence",
        blocked_reasons=["missing SARIF"],
    )
    body = render_review_body(verdict, "h", "src")
    assert "### Blocked reasons" in body
    assert "- missing SARIF" in body
    assert "- No blocking findings." in body


def test_publish_verdict_posts_review() -> None:
    """publish_verdict posts a review with the mapped GitHub event."""
    runner = StubRunner()
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    event = publish_verdict("o/r", 5, verdict, "headsha", runner=runner)
    assert event == "APPROVE"
    post = runner.calls[-1]
    assert post[:3] == ["gh", "api", "-X"]
