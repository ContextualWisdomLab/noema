"""Tests for the injectable GitHub I/O layer."""

from __future__ import annotations

import base64
import json

import pytest

from noema_reviewer.github_io import (
    _fetch_check_conclusions,
    _fetch_codegraph_status,
    _fetch_dependency_findings,
    _fetch_failed_workflow_logs,
    _fetch_review_comments,
    _fetch_security_findings,
    _failure_reason,
    _render_sarif_summary,
    _severity_from_github,
    _truncate,
    default_codegraph_runner,
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
            if "select(.conclusion" in joined:
                return ""
            return json.dumps({"name": "ci", "conclusion": "success"}) + "\n\n"
        if " api graphql " in f" {joined} ":
            return json.dumps(
                {
                    "author": "bob",
                    "path": "x.py",
                    "line": 3,
                    "body": "nit",
                    "kind": "thread",
                    "state": "open",
                }
            )
        if "/reviews" in joined:
            return json.dumps(
                {
                    "author": "reviewer",
                    "path": "",
                    "line": None,
                    "body": "approved",
                    "kind": "review",
                    "state": "approved",
                }
            )
        if "/issues/5/comments" in joined:
            return json.dumps(
                {
                    "author": "alice",
                    "path": "",
                    "line": None,
                    "body": "conversation",
                    "kind": "conversation",
                    "state": "open",
                }
            )
        if "/code-scanning/alerts" in joined:
            return ""
        if "/dependabot/alerts" in joined:
            return ""
        return ""


class StubCodeGraphRunner:
    """A CodeGraph stub that records initialization and status calls."""

    def __init__(self, *, fail: bool = False) -> None:
        """Record whether commands should fail."""
        self.fail = fail
        self.calls: list[tuple[list[str], str]] = []

    def __call__(self, args, source_root):
        """Return deterministic output for init and status."""
        self.calls.append((list(args), source_root))
        if self.fail:
            raise RuntimeError("CodeGraph executable unavailable")
        return "initialized" if "init" in args else "Index is up to date"


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


def test_default_codegraph_runner_returns_stdout(tmp_path) -> None:
    """The CodeGraph command runner honors the explicit source root."""
    assert default_codegraph_runner(["printf", "ready"], str(tmp_path)) == "ready"


def test_default_codegraph_runner_raises_on_failure(tmp_path) -> None:
    """A failed CodeGraph command preserves a visible command reason."""
    with pytest.raises(RuntimeError, match="Command failed"):
        default_codegraph_runner(["false"], str(tmp_path))


def test_fetch_manifest_builds_bounded_manifest() -> None:
    """fetch_manifest assembles diff, files, checks, and comments."""
    runner = StubRunner()
    codegraph = StubCodeGraphRunner()
    manifest = fetch_manifest("o/r", 5, runner=runner, source_root="/target", codegraph_runner=codegraph)
    assert manifest.head_sha == "headsha"
    assert manifest.title == "PR title"
    assert [file.path for file in manifest.changed_files] == ["x.py", "y.py"]
    assert manifest.changed_files[0].content == "print('x')"
    assert manifest.changed_files[1].content == ""
    assert manifest.check_conclusions[0].conclusion == "success"
    assert manifest.review_comments[0].author == "bob"
    assert {comment.kind for comment in manifest.review_comments} == {"thread", "review", "conversation"}
    assert manifest.workflow_logs.startswith("No failed GitHub Actions checks")
    assert manifest.sarif_summary.startswith("No open code-scanning alerts")
    assert manifest.codegraph_status == "initialized\nIndex is up to date"
    assert not manifest.evidence_failures
    assert codegraph.calls[0] == (["codegraph", "init"], "/target")


def test_fetch_changed_file_survives_contents_error() -> None:
    """A contents API failure yields empty content, not a crash."""
    manifest = fetch_manifest("o/r", 5, runner=StubRunner(fail_contents=True))
    assert all(file.content == "" for file in manifest.changed_files)


def test_fetch_manifest_records_missing_codegraph_root() -> None:
    """A live fetch without an explicit source root fails closed visibly."""
    manifest = fetch_manifest("o/r", 5, runner=StubRunner())
    assert manifest.codegraph_status.startswith("unavailable:")
    assert manifest.evidence_failures == [manifest.codegraph_status]


def test_fetch_manifest_records_every_optional_evidence_failure() -> None:
    """Optional evidence API failures become named fail-closed manifest entries."""

    class FailingEvidenceRunner(StubRunner):
        """Fail each newly required evidence endpoint after core PR data succeeds."""

        def __call__(self, args, stdin=None):
            """Raise for review, log, scanning, and dependency evidence."""
            joined = " ".join(args)
            if " api graphql " in f" {joined} ":
                raise RuntimeError("review API denied")
            if "select(.conclusion" in joined:
                raise RuntimeError("logs API denied")
            if "/code-scanning/alerts" in joined:
                raise RuntimeError("code scanning disabled")
            if "/dependabot/alerts" in joined:
                raise RuntimeError("Dependabot disabled")
            return super().__call__(args, stdin)

    manifest = fetch_manifest(
        "o/r",
        5,
        runner=FailingEvidenceRunner(),
        source_root="/target",
        codegraph_runner=StubCodeGraphRunner(),
    )
    assert len(manifest.evidence_failures) == 4
    assert manifest.workflow_logs.startswith("Unavailable:")
    assert manifest.sarif_summary.startswith("Unavailable:")
    assert not manifest.review_comments
    assert not manifest.dependency_findings


def test_failure_reason_handles_empty_exception() -> None:
    """An empty exception still yields a meaningful bounded reason."""
    assert _failure_reason("source", RuntimeError("")) == "source: unknown error"


def test_codegraph_failure_is_visible() -> None:
    """A CodeGraph command failure is returned as bounded status evidence."""
    result = _fetch_codegraph_status("/target", StubCodeGraphRunner(fail=True))
    assert result.startswith("unavailable: CodeGraph:")


def test_codegraph_empty_output_has_explicit_success_message() -> None:
    """CodeGraph success with empty stdout still records initialization."""
    assert "initialized" in _fetch_codegraph_status("/target", lambda args, root: "")


def test_failed_workflow_logs_include_exact_check_reason() -> None:
    """Failed current-head check logs are fetched and named."""

    def runner(args, stdin=None):
        joined = " ".join(args)
        if "/check-runs" in joined:
            return json.dumps({"id": 42, "name": "tests", "conclusion": "failure"})
        if "/jobs/42/logs" in joined:
            return "AssertionError: expected 1, got 2"
        return ""

    result = _fetch_failed_workflow_logs("o/r", "head", runner)
    assert "## tests (failure)" in result
    assert "AssertionError" in result


def test_failed_workflow_logs_explain_unavailable_job_log() -> None:
    """A job-log API error remains visible rather than disappearing."""

    def runner(args, stdin=None):
        if "/check-runs" in " ".join(args):
            return json.dumps({"id": 42, "name": "tests", "conclusion": "failure"})
        raise RuntimeError("HTTP 404")

    assert "log unavailable" in _fetch_failed_workflow_logs("o/r", "head", runner)


def test_failed_workflow_logs_explain_missing_head() -> None:
    """Missing head identity has an explicit log-collection reason."""
    assert "No head SHA" in _fetch_failed_workflow_logs("o/r", "", StubRunner())


def test_failed_workflow_logs_ignore_blank_and_non_job_rows() -> None:
    """Malformed empty and non-job check rows do not manufacture log evidence."""
    runner = lambda args, stdin=None: "\n{}\n"
    assert "No failed" in _fetch_failed_workflow_logs("o/r", "head", runner)


def test_security_findings_are_current_head_only_and_rendered() -> None:
    """Code-scanning parsing discards old-head alerts and preserves exact rule evidence."""
    rows = [
        {},
        {"tool": "CodeQL", "identifier": "old", "severity": "high", "commit": "old"},
        {
            "tool": "CodeQL",
            "identifier": "py/path-injection",
            "severity": "warning",
            "message": "Untrusted path",
            "path": "x.py",
            "line": 4,
            "commit": "head",
            "url": "https://example.test/1",
        },
        {"commit": "head"},
    ]
    raw = "\n" + "\n".join(json.dumps(row) for row in rows) + "\n"
    findings = _fetch_security_findings("o/r", "head", lambda args, stdin=None: raw)
    assert len(findings) == 2
    assert findings[0].severity is Severity.MEDIUM
    assert findings[1].identifier == "unknown-rule"
    summary = _render_sarif_summary("head", findings)
    assert "py/path-injection x.py:4" in summary
    assert "<no path>" in summary


def test_dependency_findings_preserve_package_cve_and_fix() -> None:
    """Dependabot alerts retain package, vulnerable range, fix, and CVE/GHSA identity."""
    raw = "\n".join(
        [
            "",
            json.dumps(
                {
                    "package": "urllib3",
                    "installed": "<2.6.0",
                    "fixed": "2.6.0",
                    "severity": "high",
                    "ghsa": "GHSA-test",
                    "cve": "CVE-2099-0001",
                }
            ),
            json.dumps({"ghsa": "GHSA-fallback"}),
        ]
    )
    calls = []

    def runner(args, stdin=None):
        calls.append(args)
        return raw

    findings = _fetch_dependency_findings("o/r", runner)
    assert findings[0].package_name == "urllib3"
    assert findings[0].identifier == "CVE-2099-0001"
    assert findings[0].fixed_version == "2.6.0"
    assert findings[1].package_name == "unknown-package"
    assert findings[1].identifier == "GHSA-fallback"
    assert "security_advisory.identifiers" in " ".join(calls[0])


def test_review_context_handles_empty_sources() -> None:
    """Empty review APIs produce an empty context list without phantom comments."""
    assert _fetch_review_comments("o/r", 5, lambda args, stdin=None: "") == []


def test_review_threads_paginate_to_exhaust_the_connection() -> None:
    """The GraphQL thread query follows every top-level review-thread page."""
    calls = []

    def runner(args, stdin=None):
        calls.append(args)
        return ""

    _fetch_review_comments("o/r", 5, runner)
    graphql = calls[0]
    assert "--paginate" in graphql
    query = next(arg for arg in graphql if arg.startswith("query="))
    assert "$endCursor:String" in query
    assert "after:$endCursor" in query
    assert "pageInfo{hasNextPage endCursor}" in query
    assert "comments(first:100)" in query
    assert "pageInfo{hasNextPage}" in query
    jq_filter = next(arg for arg in graphql if "complete context cannot be bounded" in arg)
    assert "any(" in jq_filter


def test_fetch_manifest_fails_closed_when_comment_context_exceeds_bound() -> None:
    """Collecting more comments than the model bound blocks silent approval."""

    class ManyCommentsRunner(StubRunner):
        """Return more review-thread comments than the bounded manifest can retain."""

        def __call__(self, args, stdin=None):
            """Expand only the GraphQL review-thread response."""
            joined = " ".join(args)
            if " api graphql " in f" {joined} ":
                return "\n".join(
                    json.dumps(
                        {
                            "author": f"reviewer-{index}",
                            "path": "x.py",
                            "line": index + 1,
                            "body": "review context",
                            "kind": "thread",
                            "state": "resolved" if index == 0 else "open",
                        }
                    )
                    for index in range(201)
                )
            return super().__call__(args, stdin)

    manifest = fetch_manifest(
        "o/r",
        5,
        runner=ManyCommentsRunner(),
        source_root="/target",
        codegraph_runner=StubCodeGraphRunner(),
    )
    assert len(manifest.review_comments) == 200
    assert all(comment.state == "open" for comment in manifest.review_comments)
    assert any("collected 203 comments" in failure for failure in manifest.evidence_failures)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("critical", Severity.CRITICAL), ("moderate", Severity.MEDIUM), ("warning", Severity.MEDIUM),
     ("note", Severity.LOW), ("unknown", Severity.INFO)],
)
def test_github_severity_normalization(raw, expected) -> None:
    """GitHub advisory labels are normalized conservatively."""
    assert _severity_from_github(raw) is expected


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
