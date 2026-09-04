"""Structured review-verdict schema for the Noema second reviewer.

The shapes here are the wire contract documented in
``docs/noema-agent-sandbox-plan.md`` ("The driver returns JSON"). Keeping them
as Pydantic models lets the PydanticAI agent emit a validated object directly
and lets every consumer (the central ``.github`` review gate, tests, and any
future sandbox plane) share one source of truth.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


class Verdict(str, Enum):
    """The three terminal review outcomes the reviewer can publish."""

    APPROVE = "approve"
    REQUEST_CHANGES = "request_changes"
    BLOCKED = "blocked"


class Severity(str, Enum):
    """Finding severity ordered from most to least serious."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Confidence(str, Enum):
    """Calibrated confidence the reviewer attaches to its verdict."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Priority(str, Enum):
    """Review priority compatible with actionable PR-review conventions."""

    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class EvidenceType(str, Enum):
    """The source that independently supports a finding."""

    NEARBY_IMPLEMENTATION = "nearby_implementation"
    MATCHING_EXAMPLE = "matching_existing_example"
    CROSS_FILE_COUNTERPART = "cross_file_counterpart"
    OFFICIAL_DOCS = "current_official_docs"
    FAILED_CHECK = "failed_check_or_log"


# Severities at or above which an unresolved dependency finding must block an
# approval (the org rule: remediate MEDIUM-or-higher by bump, never by gate
# weakening). Ordered worst-first for deterministic comparisons.
BLOCKING_SEVERITIES: tuple[Severity, ...] = (
    Severity.CRITICAL,
    Severity.HIGH,
    Severity.MEDIUM,
)


class Finding(BaseModel):
    """A single reviewer-facing issue tied to concrete evidence."""

    severity: Severity = Field(description="How serious the issue is.")
    priority: Priority = Field(description="P1, P2, or P3 review priority.")
    path: str = Field(description="Repository-relative path the issue lives in.")
    line: int | None = Field(
        default=None,
        description="1-indexed line the issue anchors to, when known.",
    )
    check_name: str | None = Field(
        default=None,
        description=(
            "Exact current-head failed check causally explained by this finding, "
            "when the finding is a failed-check RCA."
        ),
    )
    evidence: str = Field(
        min_length=1,
        description="Log, SARIF, test, or source reference proving the issue is real.",
    )
    evidence_type: EvidenceType = Field(description="The kind of source evidence supporting the finding.")
    observable_impact: str = Field(
        min_length=1,
        description="The user- or operator-visible failure caused by the issue.",
    )
    trigger: str = Field(
        min_length=1,
        description="The concrete condition or workflow that exposes the issue.",
    )
    recommendation: str = Field(
        min_length=1,
        description="The specific fix the author should apply.",
    )
    regression_command: str = Field(
        min_length=1,
        description="One exact command or test target that verifies the fix.",
    )
    suggested_diff: str | None = Field(
        default=None,
        max_length=8000,
        description="Minimal replacement text for a GitHub suggestion block, when possible.",
    )

    @field_validator("regression_command")
    @classmethod
    def require_single_line_command(cls, value: str) -> str:
        """Keep the published command exact and safe inside inline-code markup."""
        if any(character in value for character in "\r\n`"):
            raise ValueError("regression command must be one plain-text command")
        return value

    @field_validator("suggested_diff")
    @classmethod
    def reject_suggestion_fence_injection(cls, value: str | None) -> str | None:
        """Prevent model output from escaping the GitHub suggestion fence."""
        if value is not None and "```" in value:
            raise ValueError("suggested diff cannot contain a Markdown fence")
        return value


class ReviewVerdict(BaseModel):
    """The complete, publishable verdict returned by a review driver."""

    verdict: Verdict = Field(description="The terminal outcome of the review.")
    summary: str = Field(description="Short reviewer-facing summary.")
    findings: list[Finding] = Field(
        default_factory=list,
        description="Concrete, evidence-backed findings.",
    )
    suggested_patch_ref: str | None = Field(
        default=None,
        description="Optional artifact path or branch holding a suggested patch.",
    )
    blocked_reasons: list[str] = Field(
        default_factory=list,
        description="Missing required log/SARIF/review context that blocked a decision.",
    )
    confidence: Confidence = Field(
        default=Confidence.MEDIUM,
        description="Calibrated confidence in the verdict.",
    )

    @model_validator(mode="after")
    def validate_approval_invariants(self) -> "ReviewVerdict":
        """Reject approval states that still contain deterministic blockers."""
        if self.verdict is not Verdict.APPROVE:
            return self
        if self.blocked_reasons:
            raise ValueError("approval verdict cannot contain blocked reasons")
        if any(finding.severity in BLOCKING_SEVERITIES for finding in self.findings):
            raise ValueError("approval verdict cannot contain blocking findings")
        return self

    def is_approval(self) -> bool:
        """Return whether this verdict approves the pull request."""
        return self.verdict is Verdict.APPROVE
