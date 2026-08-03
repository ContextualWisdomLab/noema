"""Regression tests for complete current-head check-run pagination."""

from __future__ import annotations

import json

from noema_reviewer.github_io import _fetch_check_conclusions


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


def test_check_conclusions_request_every_page_at_maximum_page_size() -> None:
    """Noema must not silently omit checks beyond GitHub's default first page."""
    runner = PaginatedCheckRunner()

    checks = _fetch_check_conclusions("ContextualWisdomLab/example", "a" * 40, runner)

    assert len(checks) == 101
    assert checks[-1].name == "check-100"
    assert len(runner.calls) == 1
    command = runner.calls[0]
    assert "--paginate" in command
    endpoint = next(part for part in command if "/check-runs" in part)
    assert endpoint.endswith("/check-runs?per_page=100")
