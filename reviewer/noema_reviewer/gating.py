"""Deterministic safety gates applied around the LLM review.

The model produces a judgement, but deterministic evidence remains authoritative:
strict reviews block when required evidence is missing; every unresolved current-
head dependency/security finding, non-success independent check, and open review
thread prevents approval. Severity is retained only as evidence metadata.
"""

from __future__ import annotations

from .manifest import ReviewManifest
from .models import Finding, ReviewVerdict, Severity, Verdict


REVIEW_DEPENDENT_CHECK_NAMES = frozenset(
    {"opencode-review", "metadata-only gate evaluation"}
)


def missing_evidence(manifest: ReviewManifest) -> list[str]:
    """Return human-readable reasons the manifest lacks review-grade evidence."""
    reasons: list[str] = []
    if not manifest.diff.strip():
        reasons.append("missing pull request diff")
    elif manifest.diff_truncated:
        reasons.append("pull request diff was truncated")
    if not manifest.changed_files:
        reasons.append("missing changed-file context")
    if not manifest.check_conclusions:
        reasons.append("missing current GitHub check conclusions")
    codegraph_status = manifest.codegraph_status.strip()
    if not codegraph_status:
        reasons.append("missing CodeGraph evidence")
    elif codegraph_status.lower().startswith("unavailable"):
        reasons.append(manifest.codegraph_status)
    reasons.extend(
        f"evidence collection failure: {failure}" for failure in manifest.evidence_failures
    )
    return reasons


def blocked_verdict(reasons: list[str]) -> ReviewVerdict:
    """Build a ``blocked`` verdict that names every missing input."""
    return ReviewVerdict(
        verdict=Verdict.BLOCKED,
        summary=(
            "Noema could not reach a decision because required review evidence "
            "was missing; see blocked_reasons."
        ),
        blocked_reasons=reasons,
    )


def dependency_findings_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert every unresolved dependency finding into a review finding."""
    findings: list[Finding] = []
    for dependency in manifest.unresolved_dependency_findings():
        fixed = dependency.fixed_version or "a non-vulnerable release"
        identifier = f" ({dependency.identifier})" if dependency.identifier else ""
        findings.append(
            Finding(
                severity=dependency.severity,
                path=dependency.package_name,
                evidence=(
                    f"{dependency.tool} reported {dependency.package_name}"
                    f"@{dependency.installed_version or 'current'}{identifier}"
                ),
                recommendation=(
                    f"Bump {dependency.package_name} to {fixed} and refresh the lockfile."
                ),
            )
        )
    return findings


def security_findings_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert every current-head structured scanner finding into review evidence."""
    return [
        Finding(
            severity=security.severity,
            path=security.path or ".github/code-scanning",
            line=security.line,
            evidence=(
                f"{security.tool} reported {security.identifier}: {security.message}"
                + (f" ({security.url})" if security.url else "")
            ),
            recommendation="Remediate the current-head scanner finding and rerun code scanning.",
        )
        for security in manifest.security_findings
    ]


def failed_checks_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert every observed non-success independent current-head check into a finding."""
    return [
        Finding(
            severity=Severity.HIGH,
            path=f".github/checks/{check.name}",
            evidence=(
                f"Current-head check concluded {check.conclusion}; see bounded workflow_logs."
            ),
            recommendation="Require terminal success for the current-head check before approval.",
        )
        for check in manifest.check_conclusions
        if check.name not in REVIEW_DEPENDENT_CHECK_NAMES
        and check.conclusion.lower() != "success"
    ]


def unresolved_threads_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert unresolved, non-outdated inline threads into review findings."""
    return [
        Finding(
            severity=Severity.HIGH,
            path=comment.path or ".github/review-threads",
            line=comment.line,
            evidence=f"Unresolved review thread by {comment.author}: {comment.body}",
            recommendation="Resolve the cited review thread with a current-head fix or response.",
        )
        for comment in manifest.review_comments
        if comment.kind == "thread" and comment.state == "open"
    ]


def _enforce_findings(
    verdict: ReviewVerdict,
    findings: list[Finding],
    summary_prefix: str,
) -> ReviewVerdict:
    """Merge deterministic findings and prevent an approval from hiding them."""
    if not findings or verdict.verdict is Verdict.BLOCKED:
        return verdict

    def identity(finding: Finding) -> tuple[Severity, str, int | None, str, str]:
        return (
            finding.severity,
            finding.path,
            finding.line,
            finding.evidence,
            finding.recommendation,
        )

    existing = {identity(finding) for finding in verdict.findings}
    merged = list(verdict.findings)
    for finding in findings:
        key = identity(finding)
        if key not in existing:
            merged.append(finding)
            existing.add(key)
    summary = verdict.summary
    if verdict.verdict is Verdict.APPROVE:
        summary = summary_prefix + summary
    return verdict.model_copy(
        update={
            "verdict": Verdict.REQUEST_CHANGES,
            "findings": merged,
            "summary": summary,
        }
    )


def enforce_security_and_check_gates(
    manifest: ReviewManifest,
    verdict: ReviewVerdict,
) -> ReviewVerdict:
    """Block approvals on any unresolved current-head scanner/check/thread evidence."""
    deterministic = (
        failed_checks_as_review(manifest)
        + security_findings_as_review(manifest)
        + unresolved_threads_as_review(manifest)
    )
    return _enforce_findings(
        verdict,
        deterministic,
        "Downgraded to request_changes: unresolved current-head check, scanner, "
        "or review-thread evidence requires remediation. ",
    )


def enforce_dependency_gate(
    manifest: ReviewManifest,
    verdict: ReviewVerdict,
) -> ReviewVerdict:
    """Downgrade an approval that ignores any unresolved dependency finding."""
    dependency_findings = dependency_findings_as_review(manifest)
    return _enforce_findings(
        verdict,
        dependency_findings,
        "Downgraded to request_changes: unresolved dependency finding(s) must be "
        "remediated before approval. ",
    )


def apply_gates(
    manifest: ReviewManifest,
    verdict: ReviewVerdict,
    *,
    strict: bool,
) -> ReviewVerdict:
    """Apply evidence, current-head, and dependency gates to a raw verdict."""
    if strict:
        reasons = missing_evidence(manifest)
        if reasons:
            return blocked_verdict(reasons)
    check_gated = enforce_security_and_check_gates(manifest, verdict)
    return enforce_dependency_gate(manifest, check_gated)
