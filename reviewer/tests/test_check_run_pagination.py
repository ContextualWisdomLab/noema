"""Regression tests for complete current-head check-run pagination."""

from __future__ import annotations

import json

from noema_reviewer.github_io import (
    _fetch_check_conclusions,
    _fetch_failed_workflow_logs,
)


class PaginatedCheckRunner:
    """Return more check rows than GitHub's maximum response page."""

    def __init__(self, *, include_late_failure: bool = False) -> None:
        """Initialize recorded commands and optional second-page failure evidence."""
        self.calls: list[list[str]] = []
        self.include_late_failure = include_late_failure

    def __call__(self, args, stdin=None):
        """Return 101 checks or the log belonging to the late failed check."""
        self.calls.append(list(args))
        if any("/actions/jobs/" in part for part in args):
            return "late failure details"

        checks = [
            {"name": f"check-{index}", "conclusion": "success"}
            for index in range(100)
        ]
        late_check = {"name": "check-100", "conclusion": "success"}
        if self.include_late_failure:
            late_check.update({"id": 987654, "conclusion": "failure"})
        checks.append(late_check)
        return "\n".join(json.dumps(check) for check in checks)


def _check_runs_command(runner: PaginatedCheckRunner) -> list[str]:
    """Return the single check-runs API command recorded by the stub."""
    return next(call for call in runner.calls if any("/check-runs" in part for part in call))


def _assert_complete_pagination(command: list[str]) -> None:
    """Require exhaustive Check Runs pagination at GitHub's maximum page size."""
    assert "--paginate" in command
    endpoint = next(part for part in command if "/check-runs" in part)
    assert endpoint.endswith("/check-runs?per_page=100")


def test_check_conclusions_request_every_page_at_maximum_page_size() -> None:
    """Noema must not silently omit checks beyond GitHub's first maximum page."""
    runner = PaginatedCheckRunner()

    checks = _fetch_check_conclusions("ContextualWisdomLab/example", "a" * 40, runner)

    assert len(checks) == 101
    assert checks[-1].name == "check-100"
    assert len(runner.calls) == 1
    _assert_complete_pagination(_check_runs_command(runner))


def test_failed_workflow_logs_retain_a_failure_after_the_first_page() -> None:
    """Failure-log evidence must retain a failed check beyond the first 100 rows."""
    runner = PaginatedCheckRunner(include_late_failure=True)

    logs = _fetch_failed_workflow_logs(
        "ContextualWisdomLab/example",
        "a" * 40,
        runner,
    )

    assert "## check-100 (failure)" in logs
    assert "late failure details" in logs
    assert any("/actions/jobs/987654/logs" in part for call in runner.calls for part in call)
    command = _check_runs_command(runner)
    _assert_complete_pagination(command)
    jq_filter = command[command.index("--jq") + 1]
    assert 'select(.conclusion == "failure"' in jq_filter
