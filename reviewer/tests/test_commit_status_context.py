"""Regression tests for legacy GitHub commit-status evidence."""

from __future__ import annotations

import json

from noema_reviewer.gating import failed_checks_as_review
from noema_reviewer.github_io import (
    _fetch_status_conclusions,
    _merge_check_conclusions,
)
from noema_reviewer.manifest import CheckConclusion, ReviewManifest


class PaginatedStatusRunner:
    """Return reverse-chronological status rows with duplicates and blanks."""

    def __init__(self) -> None:
        """Initialize the recorded command list."""
        self.calls: list[list[str]] = []

    def __call__(self, args, stdin=None):
        """Record the command and return newest-first legacy status rows."""
        self.calls.append(list(args))
        rows = [
            {"name": "legacy-ci", "conclusion": "pending"},
            {"name": "legacy-ci", "conclusion": "success"},
            {"name": "", "conclusion": "success"},
            {"name": "release-gate", "conclusion": "error"},
        ]
        return "\n\n" + "\n".join(json.dumps(row) for row in rows)


def test_commit_statuses_are_paginated_and_keep_latest_context_state() -> None:
    """Noema must retain the newest status per context across every API page."""
    runner = PaginatedStatusRunner()

    statuses = _fetch_status_conclusions(
        "ContextualWisdomLab/example",
        "a" * 40,
        runner,
    )

    assert [(status.name, status.conclusion) for status in statuses] == [
        ("legacy-ci", "pending"),
        ("release-gate", "error"),
    ]
    assert len(runner.calls) == 1
    command = runner.calls[0]
    assert "--paginate" in command
    endpoint = next(part for part in command if "/statuses" in part)
    assert endpoint.endswith("/statuses?per_page=100")


def test_commit_statuses_are_empty_without_head_sha() -> None:
    """Missing head identity must not perform a commit-status request."""
    runner = PaginatedStatusRunner()

    assert _fetch_status_conclusions("o/r", "", runner) == []
    assert runner.calls == []


def test_check_runs_take_precedence_over_same_named_legacy_status() -> None:
    """A Checks API result wins when both GitHub APIs expose the same context."""
    merged = _merge_check_conclusions(
        [CheckConclusion(name="ci", conclusion="success")],
        [
            CheckConclusion(name="ci", conclusion="failure"),
            CheckConclusion(name="legacy-only", conclusion="success"),
        ],
    )

    assert [(check.name, check.conclusion) for check in merged] == [
        ("ci", "success"),
        ("legacy-only", "success"),
    ]


def test_legacy_error_status_is_a_blocking_current_head_failure() -> None:
    """GitHub's terminal ``error`` state must produce a deterministic finding."""
    manifest = ReviewManifest(
        check_conclusions=[
            CheckConclusion(name="legacy-release", conclusion="error")
        ]
    )

    findings = failed_checks_as_review(manifest)

    assert len(findings) == 1
    assert findings[0].path == ".github/checks/legacy-release"
    assert "concluded error" in findings[0].evidence
