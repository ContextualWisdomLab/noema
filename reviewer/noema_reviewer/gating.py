"""Deterministic safety gates applied around the LLM review.

The model produces a judgement, but deterministic evidence remains authoritative:
strict reviews block when required evidence is missing; every unresolved current-
head dependency/security finding, non-success independent check, and open review
thread prevents approval. Severity is retained only as evidence metadata. Missing
evidence never erases findings that were successfully collected.
"""

from __future__ import annotations

from .manifest import ReviewManifest
from .models import Finding, ReviewVerdict, Severity, Verdict


REVIEW_DEPENDENT_CHECK_NAMES = frozenset(
    {"noema-review", "opencode-review", "metadata-only gate evaluation"}
)

CODEGRAPH_EXPLORE_MARKER = "## codegraph explore"
RAW_CODEGRAPH_EXPLORE_MARKER = "[raw codegraph explore marker]"
NON_SEMANTIC_CODEGRAPH_EXPLORE_OUTPUTS = frozenset(
    {
        "initialized",
        "synced",
        "index is up to date",
        "codegraph initialized; status produced no output.",
    }
)


def _codegraph_explore_section(codegraph_status: str) -> tuple[str, int, str]:
    """Return normalized status, marker count, and the sole trusted explore section."""
    status_lower = codegraph_status.strip().lower()
    status_lines = status_lower.splitlines()
    marker_indexes = [
        index
        for index, raw_line in enumerate(status_lines)
        if raw_line.strip() == CODEGRAPH_EXPLORE_MARKER
    ]
    marker_count = len(marker_indexes)
    if marker_count != 1:
        return status_lower, marker_count, ""
    return (
        status_lower,
        marker_count,
        "\n".join(status_lines[marker_indexes[0] + 1 :]),
    )


def _has_semantic_codegraph_context(manifest: ReviewManifest) -> bool:
    """Require retained semantic bytes after exactly one wrapper-owned explore marker."""
    _, marker_count, explore_section = _codegraph_explore_section(manifest.codegraph_status)
    if marker_count != 1:
        return False
    semantic_lines = explore_section.splitlines()
    return any(
        line
        and line not in NON_SEMANTIC_CODEGRAPH_EXPLORE_OUTPUTS
        and line != RAW_CODEGRAPH_EXPLORE_MARKER
        and not line.startswith("[truncated ")
        and not line.startswith("## codegraph ")
        and not line.startswith("::")
        and line.isprintable()
        and any(character.isalnum() for character in line)
        for raw_line in semantic_lines
        if (line := raw_line.strip())
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
    elif not any(
        check.name not in REVIEW_DEPENDENT_CHECK_NAMES
        for check in manifest.check_conclusions
    ):
        reasons.append("missing independent current-head check conclusions")
    codegraph_status = manifest.codegraph_status.strip()
    codegraph_status_lower, explore_marker_count, final_explore_section = _codegraph_explore_section(
        codegraph_status
    )
    classification_lines = [
        line
        for raw_line in final_explore_section.splitlines()
        if (line := raw_line.strip())
        and line not in NON_SEMANTIC_CODEGRAPH_EXPLORE_OUTPUTS
        and line != RAW_CODEGRAPH_EXPLORE_MARKER
        and not line.startswith(("## codegraph ", "::", "[truncated "))
    ]
    normalized_final_explore = " ".join(
        token for line in classification_lines for token in line.split()
    )
    if not codegraph_status:
        reasons.append("missing CodeGraph evidence")
    elif codegraph_status_lower.startswith("unavailable"):
        reasons.append(manifest.codegraph_status)
    elif explore_marker_count > 1:
        reasons.append("CodeGraph semantic query has ambiguous provenance")
    elif normalized_final_explore.startswith("no relevant code found"):
        reasons.append("CodeGraph semantic query returned no relevant code")
    elif not _has_semantic_codegraph_context(manifest):
        reasons.append("CodeGraph semantic query produced no review context")
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
    """Merge deterministic findings without allowing another state to erase them."""
    if not findings:
        return verdict

    def identity(finding: Finding) -> tuple[Severity, str, int | None, str, str]:
        """Return the de-duplication key for one finding."""
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

    if verdict.verdict is Verdict.BLOCKED:
        return verdict.model_copy(update={"findings": merged})

    summary = verdict.summary
    outcome = verdict.verdict
    if verdict.verdict is Verdict.APPROVE:
        summary = summary_prefix + summary
        outcome = Verdict.REQUEST_CHANGES
    return verdict.model_copy(
        update={
            "verdict": outcome,
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
    gated = verdict
    if strict:
        reasons = missing_evidence(manifest)
        if reasons:
            gated = blocked_verdict(reasons).model_copy(
                update={"findings": list(verdict.findings)}
            )
    check_gated = enforce_security_and_check_gates(manifest, gated)
    return enforce_dependency_gate(manifest, check_gated)
