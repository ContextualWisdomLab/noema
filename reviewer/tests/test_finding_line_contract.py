"""Regression tests for exact GitHub review-line identity."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from noema_reviewer.models import EvidenceType, Finding, Priority, Severity


def _finding_payload(line: object) -> dict[str, object]:
    """Build the smallest complete finding payload around one line candidate."""
    return {
        "severity": Severity.HIGH,
        "priority": Priority.P1,
        "path": "src/example.py",
        "line": line,
        "evidence": "current-head regression",
        "evidence_type": EvidenceType.NEARBY_IMPLEMENTATION,
        "observable_impact": "GitHub cannot attach the review finding to an exact source line.",
        "trigger": "Publishing a finding with a non-positive or coerced line value.",
        "recommendation": "Require an exact positive integer review line at schema admission.",
        "regression_command": "uv run pytest reviewer/tests/test_finding_line_contract.py",
    }


@pytest.mark.parametrize("invalid_line", [0, -1, True, False, 1.0, "1"])
def test_finding_rejects_non_exact_positive_integer_lines(invalid_line: object) -> None:
    """Finding.line is a 1-indexed GitHub identity, not a coercible scalar."""
    with pytest.raises(ValidationError):
        Finding.model_validate(_finding_payload(invalid_line))


def test_finding_accepts_positive_integer_or_missing_line() -> None:
    """Valid current-head line identities and intentionally absent lines remain supported."""
    assert Finding.model_validate(_finding_payload(1)).line == 1
    assert Finding.model_validate(_finding_payload(None)).line is None
