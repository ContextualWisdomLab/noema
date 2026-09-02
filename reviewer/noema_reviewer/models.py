"""Structured review-verdict schema for the Noema second reviewer."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class Verdict(str, Enum):
    """The three terminal review outcomes the reviewer can publish."""

    APPROVE = "approve"
    REQUEST_CHANGES = "request_changes"
    BLOCKED = "blocked"


class Severity(str, Enum):
    """Scanner/reviewer severity metadata, never a local admission cutoff."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Finding(BaseModel):
    """A single reviewer-facing issue tied to concrete evidence."""

    severity: Severity = Field(description="Source-provided severity metadata.")
    path: str = Field(description="Repository-relative path the issue lives in.")
    line: int | None = Field(default=None, description="1-indexed line when known.")
    evidence: str = Field(description="Evidence proving the issue is real.")
    recommendation: str = Field(description="The specific remediation to apply.")


class ReviewVerdict(BaseModel):
    """The complete, publishable verdict returned by a review driver."""

    verdict: Verdict = Field(description="The terminal outcome of the review.")
    summary: str = Field(description="Short reviewer-facing summary.")
    findings: list[Finding] = Field(default_factory=list)
    suggested_patch_ref: str | None = Field(default=None)
    blocked_reasons: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_approval_invariants(self) -> "ReviewVerdict":
        """Reject approval states that retain any unresolved finding or evidence gap."""
        if self.verdict is not Verdict.APPROVE:
            return self
        if self.blocked_reasons:
            raise ValueError("approval verdict cannot contain blocked reasons")
        if self.findings:
            raise ValueError("approval verdict cannot contain findings")
        return self

    def is_approval(self) -> bool:
        """Return whether this verdict approves the pull request."""
        return self.verdict is Verdict.APPROVE
