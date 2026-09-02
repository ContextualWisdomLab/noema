"""Structured review-verdict schema for the Noema second reviewer.

The wire contract contains only evidence-backed review state. Severity remains
finding metadata, never a local admission threshold, and categorical model
confidence is not serialized because Noema has no calibrated confidence model.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class Verdict(str, Enum):
    """The three terminal review outcomes the reviewer can publish."""

    APPROVE = "approve"
    REQUEST_CHANGES = "request_changes"
    BLOCKED = "blocked"


class Severity(str, Enum):
    """Finding severity as reported evidence metadata."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


# Compatibility for older test/client imports. This is deliberately not a
# ReviewVerdict field and therefore cannot participate in review authority or
# serialized evidence. Existing renderers see only an explicit not-applicable
# sentinel until they migrate off the historical attribute.
Confidence = Enum("LegacyConfidence", {"MEDIUM": "not-applicable"}, type=str)


class Finding(BaseModel):
    """A single reviewer-facing issue tied to concrete evidence."""

    severity: Severity = Field(description="Scanner/reviewer severity metadata.")
    path: str = Field(description="Repository-relative path the issue lives in.")
    line: int | None = Field(
        default=None,
        description="1-indexed line the issue anchors to, when known.",
    )
    evidence: str = Field(
        description="Log, SARIF, test, or source reference proving the issue is real.",
    )
    recommendation: str = Field(
        description="The specific fix the author should apply.",
    )


class ReviewVerdict(BaseModel):
    """The complete, publishable verdict returned by a review driver."""

    verdict: Verdict = Field(description="The terminal outcome of the review.")
    summary: str = Field(description="Short reviewer-facing summary.")
    findings: list[Finding] = Field(
        default_factory=list,
        description="Concrete, evidence-backed unresolved findings.",
    )
    suggested_patch_ref: str | None = Field(
        default=None,
        description="Optional artifact path or branch holding a suggested patch.",
    )
    blocked_reasons: list[str] = Field(
        default_factory=list,
        description="Missing required log/SARIF/review context that blocked a decision.",
    )

    @model_validator(mode="after")
    def validate_approval_invariants(self) -> "ReviewVerdict":
        """Reject approvals that contain any unresolved evidence or blocked reason."""
        if self.verdict is not Verdict.APPROVE:
            return self
        if self.blocked_reasons:
            raise ValueError("approval verdict cannot contain blocked reasons")
        if self.findings:
            raise ValueError("approval verdict cannot contain findings")
        return self

    @property
    def confidence(self):
        """Return a non-authoritative sentinel for legacy renderers only."""
        return Confidence.MEDIUM

    def is_approval(self) -> bool:
        """Return whether this verdict approves the pull request."""
        return self.verdict is Verdict.APPROVE
