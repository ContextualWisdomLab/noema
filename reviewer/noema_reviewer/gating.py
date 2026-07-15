"""Deterministic safety gates applied around the LLM review.

The LLM driver produces a judgement, but two guarantees from the sandbox plan's
Acceptance Criteria must hold regardless of what the model says, so they are
enforced here in plain, testable code rather than trusted to the prompt:

1. Manual **strict** runs fail (``blocked``) when required evidence is missing,
   naming exactly what was missing — never a silent pass.
2. An unresolved MEDIUM-or-higher dependency finding can never ride out on an
   ``approve``; it is downgraded to ``request_changes`` with the finding
   attached, because the org rule is "remediate by bump, not gate weakening".
"""

from __future__ import annotations

from .manifest import ReviewManifest
from .models import (
    BLOCKING_SEVERITIES,
    Confidence,
    Finding,
    ReviewVerdict,
    Severity,
    Verdict,
)


# Noema is an independent reviewer. Treating the primary OpenCode review check
# as a deterministic finding would make each reviewer wait on the other and
# deadlock the two-reviewer rule. Every other failed current-head check remains
# blocking.
INDEPENDENT_PRIMARY_CHECK_NAMES = frozenset({"opencode-review"})


def missing_evidence(manifest: ReviewManifest) -> list[str]:
    """Return human-readable reasons the manifest lacks review-grade evidence."""
    reasons: list[str] = []
    if not manifest.diff.strip():
        reasons.append("missing pull request diff")
    if not manifest.changed_files:
        reasons.append("missing changed-file context")
    if not manifest.check_conclusions:
        reasons.append("missing current GitHub check conclusions")
    if manifest.codegraph_status.lower().startswith("unavailable"):
        reasons.append(manifest.codegraph_status)
    reasons.extend(f"evidence collection failure: {failure}" for failure in manifest.evidence_failures)
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
        confidence=Confidence.HIGH,
    )


def dependency_findings_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert unresolved blocking dependency findings into review findings."""
    findings: list[Finding] = []
    for dependency in manifest.unresolved_dependency_findings(BLOCKING_SEVERITIES):
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
                recommendation=f"Bump {dependency.package_name} to {fixed} and refresh the lockfile.",
            )
        )
    return findings


def security_findings_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert current-head MEDIUM+ SARIF findings into review findings."""
    findings: list[Finding] = []
    for security in manifest.security_findings:
        if security.severity not in BLOCKING_SEVERITIES:
            continue
        findings.append(
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
        )
    return findings


def failed_checks_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert failed current-head checks into fail-visible review findings."""
    blocking_conclusions = {
        "failure",
        "cancelled",
        "timed_out",
        "action_required",
        "startup_failure",
    }
    return [
        Finding(
            severity=Severity.HIGH,
            path=f".github/checks/{check.name}",
            evidence=f"Current-head check concluded {check.conclusion}; see bounded workflow_logs.",
            recommendation="Fix the logged root cause and rerun the check on the current head.",
        )
        for check in manifest.check_conclusions
        if check.name not in INDEPENDENT_PRIMARY_CHECK_NAMES
        and check.conclusion.lower() in blocking_conclusions
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
    existing = {(finding.severity, finding.path) for finding in verdict.findings}
    merged = list(verdict.findings)
    for finding in findings:
        if (finding.severity, finding.path) not in existing:
            merged.append(finding)
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
    """Block approvals on current-head failed checks or MEDIUM+ SARIF findings."""
    deterministic = (
        failed_checks_as_review(manifest)
        + security_findings_as_review(manifest)
        + unresolved_threads_as_review(manifest)
    )
    return _enforce_findings(
        verdict,
        deterministic,
        "Downgraded to request_changes: current-head checks or MEDIUM-or-higher "
        "code-scanning findings require remediation. ",
    )


def enforce_dependency_gate(
    manifest: ReviewManifest,
    verdict: ReviewVerdict,
) -> ReviewVerdict:
    """Downgrade an approval that ignores unresolved MEDIUM+ dependency findings."""
    dependency_findings = dependency_findings_as_review(manifest)
    return _enforce_findings(
        verdict,
        dependency_findings,
        "Downgraded to request_changes: unresolved MEDIUM-or-higher dependency "
        "finding(s) must be remediated by package bump before approval. ",
    )


def apply_gates(
    manifest: ReviewManifest,
    verdict: ReviewVerdict,
    *,
    strict: bool,
) -> ReviewVerdict:
    """Apply the evidence and dependency gates to a driver's raw verdict.

    In strict mode, missing evidence short-circuits to a ``blocked`` verdict.
    The dependency gate always runs so an approval can never bury an unresolved
    MEDIUM-or-higher vulnerability.
    """
    if strict:
        reasons = missing_evidence(manifest)
        if reasons:
            return blocked_verdict(reasons)
    check_gated = enforce_security_and_check_gates(manifest, verdict)
    return enforce_dependency_gate(manifest, check_gated)
