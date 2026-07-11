"""Tests for the bounded review manifest."""

from __future__ import annotations

from noema_reviewer.manifest import DependencyFinding, ReviewManifest
from noema_reviewer.models import BLOCKING_SEVERITIES, Severity


def _manifest_with(findings: list[DependencyFinding]) -> ReviewManifest:
    """Build a minimal manifest carrying the given dependency findings."""
    return ReviewManifest(repo="o/r", pr_number=1, dependency_findings=findings)


def test_unresolved_blocking_findings_filtered_by_severity_and_state() -> None:
    """Only unresolved MEDIUM-or-higher findings are returned."""
    manifest = _manifest_with(
        [
            DependencyFinding(tool="osv", package_name="a", severity=Severity.HIGH),
            DependencyFinding(tool="osv", package_name="b", severity=Severity.LOW),
            DependencyFinding(tool="trivy", package_name="c", severity=Severity.CRITICAL, resolved=True),
            DependencyFinding(tool="trivy", package_name="d", severity=Severity.MEDIUM),
        ]
    )
    names = {finding.package_name for finding in manifest.unresolved_dependency_findings(BLOCKING_SEVERITIES)}
    assert names == {"a", "d"}


def test_no_blocking_findings_returns_empty() -> None:
    """A manifest with only low findings returns nothing blocking."""
    manifest = _manifest_with([DependencyFinding(tool="osv", package_name="x", severity=Severity.INFO)])
    assert manifest.unresolved_dependency_findings(BLOCKING_SEVERITIES) == []
