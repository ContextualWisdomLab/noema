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
    Verdict,
)


def missing_evidence(manifest: ReviewManifest) -> list[str]:
    """Return human-readable reasons the manifest lacks review-grade evidence."""
    reasons: list[str] = []
    if not manifest.diff.strip():
        reasons.append("missing pull request diff")
    if not manifest.changed_files:
        reasons.append("missing changed-file context")
    if not manifest.check_conclusions:
        reasons.append("missing current GitHub check conclusions")
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


def enforce_dependency_gate(
    manifest: ReviewManifest,
    verdict: ReviewVerdict,
) -> ReviewVerdict:
    """Downgrade an approval that ignores unresolved MEDIUM+ dependency findings."""
    dependency_findings = dependency_findings_as_review(manifest)
    if not dependency_findings:
        return verdict
    if verdict.verdict is Verdict.BLOCKED:
        return verdict

    existing = {(finding.severity, finding.path) for finding in verdict.findings}
    merged = list(verdict.findings)
    for finding in dependency_findings:
        if (finding.severity, finding.path) not in existing:
            merged.append(finding)

    summary = verdict.summary
    if verdict.verdict is Verdict.APPROVE:
        summary = (
            "Downgraded to request_changes: unresolved MEDIUM-or-higher dependency "
            "finding(s) must be remediated by package bump before approval. "
            + summary
        )
    return verdict.model_copy(
        update={
            "verdict": Verdict.REQUEST_CHANGES,
            "findings": merged,
            "summary": summary,
        }
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
    return enforce_dependency_gate(manifest, verdict)
