"""Noema independent second reviewer — the PydanticAI ``ReviewAgent`` plane.

This package is the reviewer *agent* product referenced by
``docs/noema-agent-sandbox-plan.md`` (ContextualWisdomLab/noema#9). It turns a
bounded pull-request manifest into a validated :class:`ReviewVerdict` and can
publish it as an independent GitHub review, satisfying the organization's
two-reviewer merge rule alongside OpenCode. The Noema Cloudflare Worker remains
the token-exchange boundary; this package is the judgement plane.
"""

from __future__ import annotations

from .agent import PydanticAIReviewAgent, ReviewAgent, build_agent
from .manifest import ReviewManifest
from .models import Confidence, Finding, ReviewVerdict, Severity, Verdict
from .patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    PatchValidationResult,
    PatchValidationStatus,
    inspect_patch_bytes,
)


__all__ = [
    "Confidence",
    "DockerPatchValidationRunner",
    "Finding",
    "PatchValidationProfile",
    "PatchValidationRequest",
    "PatchValidationResult",
    "PatchValidationStatus",
    "PydanticAIReviewAgent",
    "ReviewAgent",
    "ReviewManifest",
    "ReviewVerdict",
    "Severity",
    "Verdict",
    "build_agent",
    "inspect_patch_bytes",
]
