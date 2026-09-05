"""Regressions for findings that coexist with a blocked Noema verdict."""

from __future__ import annotations

from noema_reviewer.gating import apply_gates
from noema_reviewer.manifest import CheckConclusion, DependencyFinding, ReviewManifest
from noema_reviewer.models import Finding, ReviewVerdict, Severity, Verdict


def test_missing_evidence_does_not_erase_model_or_deterministic_findings() -> None:
    """A partial manifest remains blocked while every already-proven finding survives."""
    model_finding = Finding(
        severity=Severity.MEDIUM,
        path="src/current.py",
        line=7,
        evidence="current-head source line demonstrates the defect",
        recommendation="Repair the demonstrated current-head defect.",
    )
    manifest = ReviewManifest(
        repo="o/r",
        pr_number=1,
        check_conclusions=[CheckConclusion(name="build", conclusion="failure")],
        dependency_findings=[
            DependencyFinding(
                tool="osv",
                package_name="known-vulnerable",
                severity=Severity.HIGH,
                installed_version="1.0",
                fixed_version="2.0",
                identifier="CVE-test",
            )
        ],
    )
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="Partial evidence already proves one defect.",
        findings=[model_finding],
    )

    gated = apply_gates(manifest, verdict, strict=True)

    assert gated.verdict is Verdict.BLOCKED
    assert gated.blocked_reasons
    assert {finding.path for finding in gated.findings} == {
        "src/current.py",
        ".github/checks/build",
        "known-vulnerable",
    }


def test_blocked_finding_merge_deduplicates_exact_identity() -> None:
    """Repeated deterministic gating never duplicates an already-retained finding."""
    manifest = ReviewManifest(
        repo="o/r",
        pr_number=1,
        check_conclusions=[CheckConclusion(name="build", conclusion="failure")],
    )
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")

    first = apply_gates(manifest, verdict, strict=True)
    second = apply_gates(manifest, first, strict=True)

    assert second.verdict is Verdict.BLOCKED
    assert [finding.path for finding in second.findings] == [".github/checks/build"]
