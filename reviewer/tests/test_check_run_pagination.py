"""Regression tests for complete current-head check-run pagination."""

from __future__ import annotations

import json

from noema_reviewer.github_io import (
    _fetch_check_conclusions,
    _fetch_failed_workflow_logs,
)


class PaginatedCheckRunner:
    """Return more check rows than GitHub's default response page."""

    def __init__(self) -> None:
        """Initialize the recorded command list."""
        self.calls: list[list[str]] = []

    def __call__(self, args, stdin=None):
        """Record the command and return 101 current-head check conclusions."""
        self.calls.append(list(args))
        return "\n".join(
            json.dumps({"name": f"check-{index}", "conclusion": "success"})
            for index in range(101)
        )


def _check_runs_command(runner: PaginatedCheckRunner) -> list[str]:
    """Return the single check-runs API command recorded by the stub."""
    return next(call for call in runner.calls if any("/check-runs" in part for part in call))


def _assert_complete_pagination(command: list[str]) -> None:
    """Require exhaustive Check Runs pagination at GitHub's maximum page size."""
    assert "--paginate" in command
    endpoint = next(part for part in command if "/check-runs" in part)
    assert endpoint.endswith("/check-runs?per_page=100")


def test_check_conclusions_request_every_page_at_maximum_page_size() -> None:
    """Noema must not silently omit checks beyond GitHub's default first page."""
    runner = PaginatedCheckRunner()

    checks = _fetch_check_conclusions("ContextualWisdomLab/example", "a" * 40, runner)

    assert len(checks) == 101
    assert checks[-1].name == "check-100"
    assert len(runner.calls) == 1
    _assert_complete_pagination(_check_runs_command(runner))


def test_failed_workflow_logs_request_every_check_run_page() -> None:
    """Failure-log evidence must use the same exhaustive check-run pagination."""
    runner = PaginatedCheckRunner()

    logs = _fetch_failed_workflow_logs(
        "ContextualWisdomLab/example",
        "a" * 40,
        runner,
    )

    assert logs.startswith("No failed GitHub Actions checks")
    command = _check_runs_command(runner)
    _assert_complete_pagination(command)
    jq_filter = command[command.index("--jq") + 1]
    assert 'select(.conclusion == "failure"' in jq_filter
