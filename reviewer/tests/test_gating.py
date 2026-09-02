"""Tests for deterministic review-evidence gates."""

from __future__ import annotations

import pytest

from noema_reviewer.gating import (
    apply_gates,
    blocked_verdict,
    dependency_findings_as_review,
    enforce_dependency_gate,
    enforce_security_and_check_gates,
    failed_checks_as_review,
    missing_evidence,
    security_findings_as_review,
    unresolved_threads_as_review,
)
from noema_reviewer.manifest import (
    ChangedFile,
    CheckConclusion,
    DependencyFinding,
    ReviewComment,
    ReviewManifest,
    SecurityFinding,
)
from noema_reviewer.models import Finding, ReviewVerdict, Severity, Verdict


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


def test_blank_codegraph_status_is_treated_as_missing_evidence() -> None:
    """Blank CodeGraph status is missing evidence, not a silent success."""
    for blank in ("", "   ", "\n\t"):
        reasons = missing_evidence(_full_manifest(codegraph_status=blank))
        assert reasons == ["missing CodeGraph evidence"], blank
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    gated = apply_gates(_full_manifest(codegraph_status=""), verdict, strict=True)
    assert gated.verdict is Verdict.BLOCKED
    assert "missing CodeGraph evidence" in gated.blocked_reasons


def test_strict_mode_blocks_on_missing_evidence() -> None:
    """Strict mode short-circuits to a blocked verdict naming the gaps."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    gated = apply_gates(ReviewManifest(repo="o/r", pr_number=1), verdict, strict=True)
    assert gated.verdict is Verdict.BLOCKED
    assert gated.blocked_reasons
    assert "confidence" not in gated.model_dump()


def test_non_strict_mode_does_not_block_on_missing_evidence() -> None:
    """Without strict mode, missing evidence alone does not force a block."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    gated = apply_gates(ReviewManifest(repo="o/r", pr_number=1), verdict, strict=False)
    assert gated.verdict is Verdict.APPROVE


def test_strict_mode_with_full_evidence_falls_through_to_gates() -> None:
    """Strict mode with complete evidence proceeds to deterministic finding gates."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    gated = apply_gates(_full_manifest(), verdict, strict=True)
    assert gated.verdict is Verdict.APPROVE


def test_evidence_collection_failure_blocks_strict_review() -> None:
    """A named evidence-source failure cannot silently pass strict mode."""
    reasons = missing_evidence(_full_manifest(evidence_failures=["code scanning: HTTP 403"]))
    assert reasons == ["evidence collection failure: code scanning: HTTP 403"]


def test_failed_check_downgrades_approval_with_log_pointer() -> None:
    """A current-head failed check becomes a deterministic finding."""
    manifest = _full_manifest(check_conclusions=[CheckConclusion(name="build", conclusion="failure")])
    finding = failed_checks_as_review(manifest)[0]
    assert finding.path.endswith("/build")
    gated = enforce_security_and_check_gates(
        manifest,
        ReviewVerdict(verdict=Verdict.APPROVE, summary="looks good"),
    )
    assert gated.verdict is Verdict.REQUEST_CHANGES
    assert "current-head checks" in gated.summary


def test_primary_opencode_check_does_not_deadlock_independent_noema() -> None:
    """Only the exact OpenCode review check is excluded from Noema's failed-check gate."""
    manifest = _full_manifest(
        check_conclusions=[
            CheckConclusion(name="opencode-review", conclusion="failure"),
            CheckConclusion(name="build", conclusion="success"),
        ]
    )
    assert failed_checks_as_review(manifest) == []
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="independent evidence passed")
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.APPROVE


def test_review_dependent_metadata_gate_does_not_deadlock_independent_noema() -> None:
    """A downstream metadata controller cannot be a prerequisite for its reviewer."""
    manifest = _full_manifest(
        check_conclusions=[
            CheckConclusion(name="metadata-only gate evaluation", conclusion="failure"),
            CheckConclusion(name="build", conclusion="success"),
        ]
    )
    assert failed_checks_as_review(manifest) == []
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="independent evidence passed")
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.APPROVE


def test_similarly_named_failed_checks_remain_blocking() -> None:
    """Independence exceptions are exact, not substring matches."""
    for name in ("opencode-review-copy", "metadata-only gate evaluation copy"):
        manifest = _full_manifest(
            check_conclusions=[CheckConclusion(name=name, conclusion="failure")]
        )
        assert failed_checks_as_review(manifest)


def test_unresolved_current_thread_downgrades_approval() -> None:
    """An unresolved non-outdated inline thread is a deterministic blocker."""
    manifest = _full_manifest(
        review_comments=[
            ReviewComment(
                author="reviewer",
                path="src/x.py",
                line=8,
                body="This branch loses the error.",
                kind="thread",
                state="open",
            ),
            ReviewComment(
                author="reviewer",
                path="src/y.py",
                body="old",
                kind="thread",
                state="outdated",
            ),
        ]
    )
    findings = unresolved_threads_as_review(manifest)
    assert len(findings) == 1
    assert findings[0].line == 8
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.REQUEST_CHANGES


@pytest.mark.parametrize("severity", list(Severity))
def test_every_current_head_security_finding_downgrades_approval(severity: Severity) -> None:
    """Severity labels never turn an unresolved scanner finding into passing evidence."""
    manifest = _full_manifest(
        security_findings=[
            SecurityFinding(
                tool="CodeQL",
                identifier="rule-id",
                severity=severity,
                message="Current-head finding",
                path="src/App.java",
                line=9,
            )
        ]
    )
    findings = security_findings_as_review(manifest)
    assert len(findings) == 1
    gated = enforce_security_and_check_gates(
        manifest,
        ReviewVerdict(verdict=Verdict.APPROVE, summary="ok"),
    )
    assert gated.verdict is Verdict.REQUEST_CHANGES


def test_security_gate_leaves_blocked_verdict_unchanged() -> None:
    """Deterministic findings do not replace a more fundamental blocked verdict."""
    manifest = _full_manifest(check_conclusions=[CheckConclusion(name="ci", conclusion="cancelled")])
    verdict = blocked_verdict(["missing evidence"])
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.BLOCKED


@pytest.mark.parametrize("severity", list(Severity))
def test_every_unresolved_dependency_finding_downgrades_approval(severity: Severity) -> None:
    """No unresolved dependency finding is waived by a local severity threshold."""
    manifest = _full_manifest(
        dependency_findings=[
            DependencyFinding(
                tool="trivy",
                package_name="dependency",
                severity=severity,
                installed_version="1.0",
                fixed_version="2.0",
                identifier="scanner-id",
            )
        ]
    )
    findings = dependency_findings_as_review(manifest)
    assert len(findings) == 1
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="looks fine")
    gated = enforce_dependency_gate(manifest, verdict)
    assert gated.verdict is Verdict.REQUEST_CHANGES
    assert any(finding.path == "dependency" for finding in gated.findings)


def test_dependency_gate_keeps_resolved_findings_out() -> None:
    """A resolved finding does not downgrade an approval."""
    manifest = _full_manifest(
        dependency_findings=[
            DependencyFinding(tool="osv", package_name="ok", severity=Severity.INFO, resolved=True)
        ]
    )
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="fine")
    assert enforce_dependency_gate(manifest, verdict).verdict is Verdict.APPROVE


def test_dependency_gate_does_not_touch_blocked() -> None:
    """A blocked verdict is returned unchanged by the dependency gate."""
    manifest = _full_manifest(
        dependency_findings=[DependencyFinding(tool="osv", package_name="x", severity=Severity.LOW)]
    )
    verdict = blocked_verdict(["missing SARIF"])
    assert enforce_dependency_gate(manifest, verdict).verdict is Verdict.BLOCKED


def test_dependency_gate_deduplicates_existing_finding() -> None:
    """A pre-existing finding at the same path/severity is not duplicated."""
    manifest = _full_manifest(
        dependency_findings=[DependencyFinding(tool="osv", package_name="dup", severity=Severity.INFO)]
    )
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="already flagged",
        findings=[Finding(severity=Severity.INFO, path="dup", evidence="e", recommendation="r")],
    )
    gated = enforce_dependency_gate(manifest, verdict)
    assert len([f for f in gated.findings if f.path == "dup"]) == 1
