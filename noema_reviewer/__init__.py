"""Noema independent second reviewer — the PydanticAI ``ReviewAgent`` plane.

This package is the reviewer *agent* product referenced by
``docs/noema-agent-sandbox-plan.md`` (ContextualWisdomLab/noema#9). It turns a
bounded pull-request manifest into a validated :class:`ReviewVerdict` and can
publish it as an independent GitHub review, satisfying the organization's
two-reviewer merge rule alongside OpenCode. The Noema Cloudflare Worker remains
the token-exchange boundary; this package is the judgement plane.
"""

from __future__ import annotations

from .claim_evidence import (
    ClaimEvidenceReceipt,
    EvidenceKind,
    ExecutionClaimReceipt,
    ProducedClaimEvidence,
    ResearchClaimReceipt,
    SourceClaimReceipt,
    admit_claim_evidence,
    index_claim_evidence_receipts,
    parse_trusted_claim_evidence_receipts,
    produce_execution_claim_receipt,
    produce_research_claim_receipt,
    sha256_text,
)
from .agent import PydanticAIReviewAgent, ReviewAgent, build_agent
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

__all__ = [
    "ClaimEvidenceReceipt",
    "EvidenceKind",
    "ExecutionClaimReceipt",
    "ProducedClaimEvidence",
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
    "ResearchClaimReceipt",
    "ReviewAgent",
    "ReviewManifest",
    "ReviewVerdict",
    "Severity",
    "SourceClaimReceipt",
    "Verdict",
    "admit_claim_evidence",
    "build_agent",
    "inspect_patch_bytes",
    "index_claim_evidence_receipts",
    "inspect_patch_for_image",
    "parse_trusted_claim_evidence_receipts",
    "produce_execution_claim_receipt",
    "produce_research_claim_receipt",
    "sha256_text",
]
