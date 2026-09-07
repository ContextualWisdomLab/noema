"""Noema independent second reviewer — the PydanticAI ``ReviewAgent`` plane.

This package is the reviewer *agent* product referenced by
``docs/noema-agent-sandbox-plan.md`` (ContextualWisdomLab/noema#9). It turns a
bounded pull-request manifest into a validated :class:`ReviewVerdict` and can
publish it as an independent GitHub review, satisfying the organization's
two-reviewer merge rule alongside OpenCode. The Noema Cloudflare Worker remains
the token-exchange boundary; this package is the judgement plane.

Agent-construction exports are loaded lazily so evidence-only modules can run
without importing the model runtime. That keeps collection and sandbox evidence
paths independent from the shared ``noema_core`` package while preserving the
existing package-level reviewer API for actual model execution.
"""

from __future__ import annotations

from typing import Any

from .manifest import ReviewManifest
from .models import Confidence, Finding, ReviewVerdict, Severity, Verdict
from .patch_image_validation import (
    DockerPatchValidatorImageRunner,
    PatchValidatorImageProfile,
    PatchValidatorImageRequest,
    PatchValidatorImageResult,
    PatchValidatorImageStatus,
    inspect_patch_for_image,
)
from .patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    PatchValidationResult,
    PatchValidationStatus,
    inspect_patch_bytes,
)

_AGENT_EXPORTS = frozenset({"PydanticAIReviewAgent", "ReviewAgent", "build_agent"})


def __getattr__(name: str) -> Any:
    """Load model-runtime exports only when callers request those symbols."""

    if name in _AGENT_EXPORTS:
        from . import agent

        return getattr(agent, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "Confidence",
    "DockerPatchValidationRunner",
    "DockerPatchValidatorImageRunner",
    "Finding",
    "PatchValidationProfile",
    "PatchValidationRequest",
    "PatchValidationResult",
    "PatchValidationStatus",
    "PatchValidatorImageProfile",
    "PatchValidatorImageRequest",
    "PatchValidatorImageResult",
    "PatchValidatorImageStatus",
    "PydanticAIReviewAgent",
    "ReviewAgent",
    "ReviewManifest",
    "ReviewVerdict",
    "Severity",
    "Verdict",
    "build_agent",
    "inspect_patch_bytes",
    "inspect_patch_for_image",
]
