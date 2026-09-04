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
# deadlock the two-reviewer rule. The metadata-only gate is also downstream of
# review evidence, so it cannot be used as evidence against an independent
# review. Every other observed current-head check must be terminal-success.
REVIEW_DEPENDENT_CHECK_NAMES = frozenset(
    {"opencode-review", "metadata-only gate evaluation"}
)

CODEGRAPH_EXPLORE_MARKER = "## codegraph explore"

# These are lifecycle/status banners emitted by CodeGraph collection paths, not
# semantic review context. The explore provenance wrapper must not promote them
# merely because they were returned on the explore stdout channel.
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
    codegraph_status = manifest.codegraph_status.strip()
    codegraph_status_lower, explore_marker_count, final_explore_section = _codegraph_explore_section(
        codegraph_status
    )
    normalized_final_explore = " ".join(
        line
        for raw_line in final_explore_section.splitlines()
        if (line := raw_line.strip())
        and not line.startswith(("## codegraph ", "::", "[truncated "))
    )
    if not codegraph_status:
        # A blank/whitespace status is not evidence; treat it as missing so a
        # malformed artifact cannot pass strict mode silently (mirrors the diff
        # check above and the field's own "not supplied" default semantics).
        reasons.append("missing CodeGraph evidence")
    elif codegraph_status_lower.startswith("unavailable"):
        reasons.append(manifest.codegraph_status)
    elif explore_marker_count > 1:
        # The production wrapper emits exactly one provenance marker. A second
        # marker can only come from untrusted output or a malformed prepared
        # manifest, so strict review cannot choose which section is authoritative.
        reasons.append("CodeGraph semantic query has ambiguous provenance")
    elif "no relevant code found" in normalized_final_explore:
        # CodeGraph can initialize and index successfully while returning no
        # semantic context. The sole provenance-labelled explore section owns
        # that classification; setup/status output cannot override it.
        reasons.append("CodeGraph semantic query returned no relevant code")
    elif not _has_semantic_codegraph_context(manifest):
        reasons.append("CodeGraph semantic query produced no review context")
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


def failed_check_blockers(manifest: ReviewManifest) -> list[str]:
    """Return failed checks that lack an actionable current-head source finding."""
    failed = [
        check.name
        for check in manifest.check_conclusions
        if check.name not in REVIEW_DEPENDENT_CHECK_NAMES
        and check.conclusion.lower() != "success"
    ]
    return [
        f"failed check {name} lacks an actionable current-head path:line finding"
        for name in failed
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
    """Block approvals on current-head non-success checks or MEDIUM+ SARIF findings."""
    deterministic = (
        security_findings_as_review(manifest)
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
    failed_checks = failed_check_blockers(manifest)
    if failed_checks:
        changed_paths = {changed.path for changed in manifest.changed_files}
        actionable = any(
            finding.severity in BLOCKING_SEVERITIES
            and finding.path in changed_paths
            and isinstance(finding.line, int)
            and not isinstance(finding.line, bool)
            and finding.line > 0
            for finding in verdict.findings
        )
        if not actionable:
            return blocked_verdict(failed_checks)
    check_gated = enforce_security_and_check_gates(manifest, verdict)
    return enforce_dependency_gate(manifest, check_gated)
