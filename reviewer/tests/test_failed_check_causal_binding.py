"""Regression tests for causal binding between failed checks and source findings."""

from __future__ import annotations

from noema_reviewer.gating import apply_gates
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest
from noema_reviewer.models import EvidenceType, Finding, Priority, ReviewVerdict, Severity, Verdict


def _manifest(*check_names: str) -> ReviewManifest:
    """Build complete review evidence with the requested failed checks."""
    return ReviewManifest(
        repo="o/r",
        pr_number=1,
        diff="diff --git a/a.py b/a.py\ndiff --git a/b.py b/b.py",
        changed_files=[
            ChangedFile(path="a.py", content="raise RuntimeError('build')"),
            ChangedFile(path="b.py", content="raise RuntimeError('lint')"),
        ],
        check_conclusions=[
            CheckConclusion(name=name, conclusion="failure") for name in check_names
        ],
        codegraph_status="## codegraph explore\na.py -> build_failure",
    )


def _finding(*, check_name: str | None) -> Finding:
    """Build one otherwise-actionable source finding for failed-check tests."""
    return Finding(
        severity=Severity.HIGH,
        priority=Priority.P1,
        path="a.py",
        line=1,
        check_name=check_name,
        evidence="current-head log reports the failing assertion at a.py:1",
        evidence_type=EvidenceType.FAILED_CHECK,
        observable_impact="The current-head check fails.",
        trigger="Running the bound check.",
        recommendation="Fix the regression and retain this assertion as a test.",
        regression_command="uv run pytest reviewer/tests/test_failed_check_causal_binding.py",
    )


def test_each_failed_check_requires_its_own_source_bound_rca() -> None:
    """One actionable finding cannot clear a second failed check."""
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="The build check has an actionable source regression.",
        findings=[_finding(check_name="build")],
    )

    gated = apply_gates(_manifest("build", "lint"), verdict, strict=False)

    assert gated.verdict is Verdict.BLOCKED
    assert gated.blocked_reasons == [
        "failed check lint lacks an actionable current-head path:line finding"
    ]


def test_unbound_actionable_finding_cannot_clear_failed_check() -> None:
    """Path and line evidence without exact check identity remains blocked."""
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="A source regression exists, but it is not bound to the failed check.",
        findings=[_finding(check_name=None)],
    )

    gated = apply_gates(_manifest("build"), verdict, strict=False)

    assert gated.verdict is Verdict.BLOCKED
    assert gated.blocked_reasons == [
        "failed check build lacks an actionable current-head path:line finding"
    ]


def test_wrong_check_identity_cannot_clear_failed_check() -> None:
    """A finding bound to another check cannot stand in for the failed check."""
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="The finding names a different check.",
        findings=[_finding(check_name="lint")],
    )

    gated = apply_gates(_manifest("build"), verdict, strict=False)

    assert gated.verdict is Verdict.BLOCKED
    assert gated.blocked_reasons == [
        "failed check build lacks an actionable current-head path:line finding"
    ]
