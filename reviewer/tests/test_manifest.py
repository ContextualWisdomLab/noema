"""Tests for the bounded review manifest."""

from __future__ import annotations

import pytest
from pydantic import BaseModel, ValidationError

from noema_reviewer.manifest import (
    ChangedFile,
    CheckConclusion,
    DependencyFinding,
    ReviewComment,
    ReviewManifest,
    SecurityFinding,
)
from noema_reviewer.models import Severity


def _manifest_with(findings: list[DependencyFinding]) -> ReviewManifest:
    """Build a minimal manifest carrying the given dependency findings."""
    return ReviewManifest(repo="o/r", pr_number=1, dependency_findings=findings)


def test_unresolved_dependency_findings_ignore_severity_labels() -> None:
    """Every unresolved finding is returned; only resolved evidence is filtered."""
    manifest = _manifest_with(
        [
            DependencyFinding(tool="osv", package_name="a", severity=Severity.HIGH),
            DependencyFinding(tool="osv", package_name="b", severity=Severity.LOW),
            DependencyFinding(
                tool="trivy",
                package_name="c",
                severity=Severity.CRITICAL,
                resolved=True,
            ),
            DependencyFinding(tool="trivy", package_name="d", severity=Severity.INFO),
        ]
    )
    names = {finding.package_name for finding in manifest.unresolved_dependency_findings()}
    assert names == {"a", "b", "d"}


def test_resolved_findings_are_not_unresolved() -> None:
    """Resolution state, not severity, removes a finding from the unresolved set."""
    manifest = _manifest_with(
        [
            DependencyFinding(
                tool="osv",
                package_name="x",
                severity=Severity.INFO,
                resolved=True,
            )
        ]
    )
    assert manifest.unresolved_dependency_findings() == []


@pytest.mark.parametrize(
    ("model", "payload"),
    (
        (
            DependencyFinding,
            {"tool": "osv", "package_name": "pkg", "severity": Severity.HIGH},
        ),
        (
            SecurityFinding,
            {
                "tool": "semgrep",
                "identifier": "rule-id",
                "severity": Severity.MEDIUM,
                "message": "finding",
            },
        ),
        (ReviewComment, {"author": "reviewer", "body": "comment"}),
        (CheckConclusion, {"name": "ci", "conclusion": "success"}),
        (ChangedFile, {"path": "src/index.ts"}),
        (ReviewManifest, {"repo": "o/r", "pr_number": 1}),
    ),
)
def test_manifest_wire_models_reject_unknown_evidence_fields(
    model: type[BaseModel],
    payload: dict[str, object],
) -> None:
    """Untrusted manifest evidence fails closed instead of discarding fields."""
    with pytest.raises(ValidationError):
        model.model_validate({**payload, "unexpected_evidence": "must-not-disappear"})
