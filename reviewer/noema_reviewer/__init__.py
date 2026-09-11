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

from .claim_evidence import (
    ClaimEvidenceRequirement,
    ClaimEvidenceReceipt,
    ClaimPublicationAuthority,
    EvidenceKind,
    ExecutionClaimReceipt,
    ProducedClaimEvidence,
    ResearchClaimReceipt,
    SourceClaimReceipt,
    VerifiedClaimEvidenceIndex,
    admit_claim_evidence,
    index_claim_evidence_receipts,
    produce_claim_evidence_manifest,
    produce_execution_claim_receipt,
    produce_research_claim_receipt,
    sha256_text,
    verify_claim_evidence_manifest,
)
from .claim_evidence_reference import (
    admit_claim_evidence_reference,
    parse_claim_evidence_reference,
)
from .claim_evidence_runtime import (
    admit_review_verdict_evidence,
    produce_current_head_source_manifest,
    prompt_claim_evidence_references,
    verify_claim_evidence_file,
)
from .sandboxed_verify_claim_evidence import (
    produce_sandboxed_verify_execution_claim_receipt,
)
from .source_claim_evidence import produce_source_claim_receipt
from .trusted_research_claim_evidence import produce_trusted_research_claim_receipt
from .manifest import ReviewManifest
from .models import Confidence, EvidenceType, Finding, Priority, ReviewVerdict, Severity, Verdict
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
    "ClaimEvidenceRequirement",
    "ClaimEvidenceReceipt",
    "ClaimPublicationAuthority",
    "EvidenceKind",
    "ExecutionClaimReceipt",
    "ProducedClaimEvidence",
    "Confidence",
    "DockerPatchValidationRunner",
    "DockerPatchValidatorImageRunner",
    "EvidenceType",
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
    "ResearchClaimReceipt",
    "Priority",
    "ReviewAgent",
    "ReviewManifest",
    "ReviewVerdict",
    "Severity",
    "SourceClaimReceipt",
    "VerifiedClaimEvidenceIndex",
    "Verdict",
    "admit_claim_evidence",
    "admit_claim_evidence_reference",
    "admit_review_verdict_evidence",
    "build_agent",
    "inspect_patch_bytes",
    "index_claim_evidence_receipts",
    "inspect_patch_for_image",
    "parse_claim_evidence_reference",
    "produce_claim_evidence_manifest",
    "produce_current_head_source_manifest",
    "produce_execution_claim_receipt",
    "produce_research_claim_receipt",
    "produce_sandboxed_verify_execution_claim_receipt",
    "produce_source_claim_receipt",
    "produce_trusted_research_claim_receipt",
    "prompt_claim_evidence_references",
    "sha256_text",
    "verify_claim_evidence_file",
    "verify_claim_evidence_manifest",
]