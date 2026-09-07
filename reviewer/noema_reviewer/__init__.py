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
from .source_claim_evidence import produce_source_claim_receipt
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
    "VerifiedClaimEvidenceIndex",
    "Verdict",
    "admit_claim_evidence",
    "admit_claim_evidence_reference",
    "build_agent",
    "inspect_patch_bytes",
    "index_claim_evidence_receipts",
    "inspect_patch_for_image",
    "parse_claim_evidence_reference",
    "produce_claim_evidence_manifest",
    "produce_execution_claim_receipt",
    "produce_research_claim_receipt",
    "produce_source_claim_receipt",
    "sha256_text",
    "verify_claim_evidence_manifest",
]
