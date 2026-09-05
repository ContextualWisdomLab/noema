"""Regression contracts for deterministic reviewer finding identity."""

from noema_reviewer.gating import enforce_security_and_check_gates
from noema_reviewer.manifest import ReviewManifest, SecurityFinding
from noema_reviewer.models import (
    EvidenceType,
    Finding,
    Priority,
    ReviewVerdict,
    Severity,
    Verdict,
)


def test_scanner_finding_is_not_hidden_by_model_finding_at_same_path_and_severity() -> None:
    """Distinct deterministic scanner evidence must survive a model path/severity collision."""
    path = "reviewer/noema_reviewer/github_io.py"
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=1,
        security_findings=[
            SecurityFinding(
                tool="CodeQL",
                identifier="py/path-injection",
                severity=Severity.HIGH,
                message="Untrusted path reaches filesystem access",
                path=path,
                line=42,
                url="https://example.invalid/alert/1",
            )
        ],
    )
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="Model found a separate issue on the same source path.",
        findings=[
            Finding(
                severity=Severity.HIGH,
                priority=Priority.P1,
                path=path,
                line=7,
                evidence="Model evidence for an unrelated boundary defect.",
                evidence_type=EvidenceType.NEARBY_IMPLEMENTATION,
                observable_impact="A separate review boundary is incorrect.",
                trigger="Reviewing the unrelated boundary path.",
                recommendation="Repair the unrelated boundary defect.",
                regression_command="python -m pytest reviewer/tests/test_gating.py",
            )
        ],
    )

    gated = enforce_security_and_check_gates(manifest, verdict)

    assert len(gated.findings) == 2
    assert any("CodeQL reported py/path-injection" in finding.evidence for finding in gated.findings)
