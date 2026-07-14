"""The bounded, untrusted input manifest handed to a review driver.

Per the sandbox plan, the agent driver never reads the repository or the
network directly: it receives a bounded manifest of files, logs, SARIF,
dependency reports, review comments, and check conclusions. Modelling that as a
validated object keeps the trust boundary explicit and testable — the driver
cannot reach beyond what the manifest carries.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from .models import Severity


class DependencyFinding(BaseModel):
    """A dependency vulnerability surfaced by OSV, Trivy, or dependency-review."""

    tool: str = Field(description="Scanner that reported the finding (osv, trivy, dependency-review).")
    package_name: str = Field(description="Vulnerable package name.")
    severity: Severity = Field(description="Reported severity.")
    installed_version: str = Field(default="", description="Version currently resolved.")
    fixed_version: str = Field(default="", description="First non-vulnerable version, when known.")
    identifier: str = Field(default="", description="CVE/GHSA identifier.")
    resolved: bool = Field(
        default=False,
        description="Whether the current head already remediates this finding.",
    )


class SecurityFinding(BaseModel):
    """A current-head code-scanning or SARIF finding."""

    tool: str = Field(description="Scanner that produced the finding.")
    identifier: str = Field(description="Rule, query, CVE, or GHSA identifier.")
    severity: Severity = Field(description="Normalized security severity.")
    message: str = Field(description="Concrete scanner message.")
    path: str = Field(default="", description="Repository-relative finding path, when present.")
    line: int | None = Field(default=None, description="Finding line, when present.")
    url: str = Field(default="", description="GitHub alert URL, when present.")


class ReviewComment(BaseModel):
    """A prior review comment preserved so the reviewer never loses context."""

    author: str = Field(description="Comment author login.")
    path: str = Field(default="", description="File the comment anchors to, if any.")
    line: int | None = Field(default=None, description="Line the comment anchors to, if any.")
    body: str = Field(description="Comment text.")
    kind: str = Field(default="thread", description="Context kind: thread, review, or conversation.")
    state: str = Field(
        default="open",
        description="Thread resolution or review decision state.",
    )


class CheckConclusion(BaseModel):
    """A current GitHub check conclusion used in the verdict."""

    name: str = Field(description="Check or status context name.")
    conclusion: str = Field(description="Conclusion such as success, failure, or neutral.")


class ChangedFile(BaseModel):
    """A changed file's path plus bounded current-head content for context."""

    path: str = Field(description="Repository-relative path.")
    content: str = Field(default="", description="Bounded current-head text content.")


class ReviewManifest(BaseModel):
    """Everything a review driver is allowed to see for one pull request."""

    repo: str = Field(description="owner/name of the target repository.")
    pr_number: int = Field(description="Pull request number under review.")
    title: str = Field(default="", description="Pull request title.")
    base_sha: str = Field(default="", description="Base commit SHA.")
    head_sha: str = Field(default="", description="Head commit SHA the verdict is bound to.")
    diff: str = Field(default="", description="Bounded unified diff of the pull request.")
    diff_truncated: bool = Field(default=False, description="Whether the diff was truncated.")
    changed_files: list[ChangedFile] = Field(default_factory=list, description="Bounded changed-file context.")
    workflow_logs: str = Field(default="", description="Bounded relevant workflow log excerpts.")
    sarif_summary: str = Field(default="", description="Bounded SARIF finding summary.")
    dependency_findings: list[DependencyFinding] = Field(
        default_factory=list,
        description="Parsed OSV/Trivy/dependency-review findings.",
    )
    security_findings: list[SecurityFinding] = Field(
        default_factory=list,
        description="Structured current-head code-scanning findings.",
    )
    review_comments: list[ReviewComment] = Field(
        default_factory=list,
        description="Prior review comments preserved for context.",
    )
    check_conclusions: list[CheckConclusion] = Field(
        default_factory=list,
        description="Current GitHub check conclusions used in the verdict.",
    )
    codegraph_status: str = Field(
        default="unavailable: CodeGraph evidence was not supplied",
        description="CodeGraph initialization status recorded in the artifact.",
    )
    evidence_failures: list[str] = Field(
        default_factory=list,
        description="Exact bounded reasons an evidence source could not be collected.",
    )

    def unresolved_dependency_findings(
        self,
        blocking: tuple[Severity, ...],
    ) -> list[DependencyFinding]:
        """Return unresolved dependency findings at or above a blocking severity."""
        blocking_set = set(blocking)
        return [
            finding
            for finding in self.dependency_findings
            if not finding.resolved and finding.severity in blocking_set
        ]
