"""Regression tests for causal binding between failed checks and source findings."""

from __future__ import annotations

from noema_reviewer.gating import apply_gates
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest
from noema_reviewer.models import Finding, ReviewVerdict, Severity, Verdict


def test_each_failed_check_requires_its_own_source_bound_rca() -> None:
    """One unrelated actionable finding cannot clear multiple failed checks."""
    manifest = ReviewManifest(
        repo="o/r",
        pr_number=1,
        diff="diff --git a/a.py b/a.py\ndiff --git a/b.py b/b.py",
        changed_files=[
            ChangedFile(path="a.py", content="raise RuntimeError('build')"),
            ChangedFile(path="b.py", content="raise RuntimeError('lint')"),
        ],
        check_conclusions=[
            CheckConclusion(name="build", conclusion="failure"),
            CheckConclusion(name="lint", conclusion="failure"),
        ],
        codegraph_status="## codegraph explore\na.py -> build_failure",
    )
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="The build check has an actionable source regression.",
        findings=[
            Finding(
                severity=Severity.HIGH,
                path="a.py",
                line=1,
                evidence="build log reports the failing assertion at a.py:1",
                recommendation="Fix the build regression and retain this assertion as a test.",
                check_name="build",
            )
        ],
    )

    gated = apply_gates(manifest, verdict, strict=False)

    assert gated.verdict is Verdict.BLOCKED
    assert gated.blocked_reasons == [
        "failed check lint lacks an actionable current-head path:line finding"
    ]
