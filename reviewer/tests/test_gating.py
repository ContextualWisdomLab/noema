"""Tests for the deterministic evidence and dependency gates."""

from __future__ import annotations

from noema_reviewer.gating import (
    apply_gates,
    blocked_verdict,
    enforce_dependency_gate,
    enforce_security_and_check_gates,
    failed_checks_as_review,
    missing_evidence,
    security_findings_as_review,
)
from noema_reviewer.manifest import (
    ChangedFile,
    CheckConclusion,
    DependencyFinding,
    ReviewManifest,
    SecurityFinding,
)
from noema_reviewer.models import Confidence, Finding, ReviewVerdict, Severity, Verdict


def _full_manifest(**overrides) -> ReviewManifest:
    """Build a manifest that has complete evidence unless overridden."""
    base = dict(
        repo="o/r",
        pr_number=1,
        diff="diff --git a b",
        changed_files=[ChangedFile(path="a", content="x")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status="Index is up to date",
    )
    base.update(overrides)
    return ReviewManifest(**base)


def test_missing_evidence_lists_each_gap() -> None:
    """An empty manifest reports every missing evidence category."""
    reasons = missing_evidence(ReviewManifest(repo="o/r", pr_number=1))
    assert "missing pull request diff" in reasons
    assert "missing changed-file context" in reasons
    assert "missing current GitHub check conclusions" in reasons
    assert "unavailable: CodeGraph" in " ".join(reasons)


def test_full_manifest_has_no_missing_evidence() -> None:
    """A complete manifest reports no missing evidence."""
    assert missing_evidence(_full_manifest()) == []


def test_strict_mode_blocks_on_missing_evidence() -> None:
    """Strict mode short-circuits to a blocked verdict naming the gaps."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    gated = apply_gates(ReviewManifest(repo="o/r", pr_number=1), verdict, strict=True)
    assert gated.verdict is Verdict.BLOCKED
    assert gated.blocked_reasons
    assert gated.confidence is Confidence.HIGH


def test_non_strict_mode_does_not_block_on_missing_evidence() -> None:
    """Without strict mode, missing evidence does not force a block."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    gated = apply_gates(ReviewManifest(repo="o/r", pr_number=1), verdict, strict=False)
    assert gated.verdict is Verdict.APPROVE


def test_strict_mode_with_full_evidence_falls_through_to_dependency_gate() -> None:
    """Strict mode with complete evidence proceeds to the dependency gate."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    gated = apply_gates(_full_manifest(), verdict, strict=True)
    assert gated.verdict is Verdict.APPROVE


def test_evidence_collection_failure_blocks_strict_review() -> None:
    """A named evidence-source failure cannot silently pass strict mode."""
    reasons = missing_evidence(_full_manifest(evidence_failures=["code scanning: HTTP 403"]))
    assert reasons == ["evidence collection failure: code scanning: HTTP 403"]


def test_failed_check_downgrades_approval_with_log_pointer() -> None:
    """A current-head failed check becomes a deterministic HIGH finding."""
    manifest = _full_manifest(check_conclusions=[CheckConclusion(name="build", conclusion="failure")])
    finding = failed_checks_as_review(manifest)[0]
    assert finding.path.endswith("/build")
    gated = enforce_security_and_check_gates(
        manifest,
        ReviewVerdict(verdict=Verdict.APPROVE, summary="looks good"),
    )
    assert gated.verdict is Verdict.REQUEST_CHANGES
    assert "current-head checks" in gated.summary


def test_medium_code_scanning_finding_downgrades_approval() -> None:
    """A current-head MEDIUM SARIF finding blocks approval."""
    manifest = _full_manifest(
        security_findings=[
            SecurityFinding(
                tool="CodeQL",
                identifier="java/log-injection",
                severity=Severity.MEDIUM,
                message="Untrusted data written to log",
                path="src/App.java",
                line=9,
                url="https://example.test/alert/1",
            )
        ]
    )
    finding = security_findings_as_review(manifest)[0]
    assert finding.line == 9
    assert "java/log-injection" in finding.evidence
    gated = enforce_security_and_check_gates(
        manifest,
        ReviewVerdict(verdict=Verdict.APPROVE, summary="ok"),
    )
    assert gated.verdict is Verdict.REQUEST_CHANGES


def test_low_code_scanning_finding_is_nonblocking() -> None:
    """A governance-style LOW alert is preserved for the model but not blocking."""
    manifest = _full_manifest(
        security_findings=[
            SecurityFinding(
                tool="Scorecard",
                identifier="CIIBestPracticesID",
                severity=Severity.LOW,
                message="badge not found",
            )
        ]
    )
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.APPROVE


def test_security_gate_leaves_blocked_verdict_unchanged() -> None:
    """Deterministic findings do not replace a more fundamental blocked verdict."""
    manifest = _full_manifest(check_conclusions=[CheckConclusion(name="ci", conclusion="cancelled")])
    verdict = blocked_verdict(["missing evidence"])
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.BLOCKED


def test_dependency_gate_downgrades_approval() -> None:
    """An approval is downgraded when an unresolved MEDIUM+ finding exists."""
    manifest = _full_manifest(
        dependency_findings=[
            DependencyFinding(
                tool="trivy",
                package_name="lodash",
                severity=Severity.HIGH,
                installed_version="4.17.20",
                fixed_version="4.17.21",
                identifier="CVE-2021-23337",
            )
        ]
    )
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="looks fine")
    gated = enforce_dependency_gate(manifest, verdict)
    assert gated.verdict is Verdict.REQUEST_CHANGES
    assert any(finding.path == "lodash" for finding in gated.findings)
    assert "request_changes" in gated.summary


def test_dependency_gate_keeps_resolved_findings_out() -> None:
    """A resolved finding does not downgrade an approval."""
    manifest = _full_manifest(
        dependency_findings=[
            DependencyFinding(tool="osv", package_name="ok", severity=Severity.HIGH, resolved=True)
        ]
    )
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="fine")
    assert enforce_dependency_gate(manifest, verdict).verdict is Verdict.APPROVE


def test_dependency_gate_does_not_touch_blocked() -> None:
    """A blocked verdict is returned unchanged by the dependency gate."""
    manifest = _full_manifest(
        dependency_findings=[DependencyFinding(tool="osv", package_name="x", severity=Severity.HIGH)]
    )
    verdict = blocked_verdict(["missing SARIF"])
    assert enforce_dependency_gate(manifest, verdict).verdict is Verdict.BLOCKED


def test_dependency_gate_deduplicates_existing_finding() -> None:
    """A pre-existing finding at the same path/severity is not duplicated."""
    manifest = _full_manifest(
        dependency_findings=[DependencyFinding(tool="osv", package_name="dup", severity=Severity.MEDIUM)]
    )
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="already flagged",
        findings=[Finding(severity=Severity.MEDIUM, path="dup", evidence="e", recommendation="r")],
    )
    gated = enforce_dependency_gate(manifest, verdict)
    assert len([f for f in gated.findings if f.path == "dup"]) == 1
