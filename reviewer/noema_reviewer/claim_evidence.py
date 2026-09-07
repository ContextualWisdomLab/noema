"""Exact-claim evidence receipts admitted by the Noema reviewer boundary.

Receipt producers run outside the untrusted model. This module validates their
sealed metadata and exact bytes; a model citation or self-declared claim kind is
never evidence authority by itself.
"""

from __future__ import annotations

import hashlib
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


_SHA256_PATTERN = r"^[0-9a-f]{64}$"
_HEAD_SHA_PATTERN = r"^[0-9a-f]{40}$"
_REPOSITORY_PATTERN = r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
_WORKFLOW_REF_PATTERN = (
    r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\.github/workflows/"
    r"[A-Za-z0-9_.-]+\.ya?ml@[0-9a-f]{40}$"
)
_SLUG_PATTERN = r"^[a-z0-9][a-z0-9._-]{0,79}$"


class EvidenceKind(str, Enum):
    """Trusted producer classes; model prose cannot select admission authority."""

    SOURCE = "source"
    EXECUTION = "execution"
    RESEARCH = "research"


class _ReceiptIdentity(BaseModel):
    """Exact workflow and artifact identity shared by every receipt class."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1]
    receipt_id: str = Field(pattern=_SLUG_PATTERN)
    repository: str = Field(pattern=_REPOSITORY_PATTERN)
    head_sha: str = Field(pattern=_HEAD_SHA_PATTERN)
    workflow_ref: str = Field(pattern=_WORKFLOW_REF_PATTERN)
    run_id: int = Field(gt=0)
    run_attempt: int = Field(gt=0)
    claim_sha256: str = Field(pattern=_SHA256_PATTERN)
    artifact_sha256: str = Field(pattern=_SHA256_PATTERN)
    artifact_size: int = Field(gt=0)
    producer_version: str = Field(pattern=_SLUG_PATTERN)
    policy_version: str = Field(pattern=_SLUG_PATTERN)


class SourceClaimReceipt(_ReceiptIdentity):
    """Receipt proving exact current-head source bytes, not external behavior."""

    evidence_kind: Literal[EvidenceKind.SOURCE]
    source_path: str = Field(min_length=1)
    source_line: int = Field(gt=0)
    source_line_sha256: str = Field(pattern=_SHA256_PATTERN)


class ExecutionClaimReceipt(_ReceiptIdentity):
    """Receipt proving one sandboxed execution result and its bounded output."""

    evidence_kind: Literal[EvidenceKind.EXECUTION]
    argv: tuple[str, ...] = Field(min_length=1)
    tool_identity: str = Field(min_length=1)
    tool_version: str = Field(min_length=1)
    exit_code: int
    stdout_sha256: str = Field(pattern=_SHA256_PATTERN)
    stderr_sha256: str = Field(pattern=_SHA256_PATTERN)
    isolation_policy: str = Field(min_length=1)
    network_policy: str = Field(min_length=1)


class ResearchClaimReceipt(_ReceiptIdentity):
    """Receipt proving one immutable external-source retrieval and excerpt."""

    evidence_kind: Literal[EvidenceKind.RESEARCH]
    source_uri: str = Field(min_length=1)
    source_revision: str = Field(min_length=1)
    excerpt_sha256: str = Field(pattern=_SHA256_PATTERN)
    retrieval_policy: str = Field(min_length=1)


ClaimEvidenceReceipt = Annotated[
    SourceClaimReceipt | ExecutionClaimReceipt | ResearchClaimReceipt,
    Field(discriminator="evidence_kind"),
]
_RECEIPT_ADAPTER = TypeAdapter(ClaimEvidenceReceipt)


def sha256_text(value: str) -> str:
    """Return the lowercase SHA-256 digest of exact UTF-8 claim bytes."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def admit_claim_evidence(
    payload: object,
    *,
    claim: str,
    artifact: bytes,
    expected_repository: str,
    expected_head_sha: str,
    expected_workflow_ref: str,
    expected_run_id: int,
    expected_run_attempt: int,
    required_kind: EvidenceKind,
) -> ClaimEvidenceReceipt:
    """Validate a sealed receipt against caller-owned identity and exact bytes.

    The required kind comes from the trusted producer channel, never from model
    output. The model may only cite a receipt ID after this admission passes.

    Raises:
        ValueError: If exact identity, kind, claim bytes, or artifact bytes do
            not match the producer receipt.
        pydantic.ValidationError: If the receipt schema itself is malformed.
    """
    receipt = _RECEIPT_ADAPTER.validate_python(payload)
    observed_identity = (
        receipt.repository,
        receipt.head_sha,
        receipt.workflow_ref,
        receipt.run_id,
        receipt.run_attempt,
    )
    expected_identity = (
        expected_repository,
        expected_head_sha,
        expected_workflow_ref,
        expected_run_id,
        expected_run_attempt,
    )
    if observed_identity != expected_identity:
        raise ValueError("claim evidence receipt identity mismatch")
    if receipt.evidence_kind != required_kind:
        raise ValueError("claim evidence receipt kind mismatch")
    if receipt.claim_sha256 != sha256_text(claim):
        raise ValueError("claim evidence receipt claim digest mismatch")
    if receipt.artifact_size != len(artifact):
        raise ValueError("claim evidence receipt artifact size mismatch")
    if receipt.artifact_sha256 != hashlib.sha256(artifact).hexdigest():
        raise ValueError("claim evidence receipt artifact digest mismatch")
    return receipt
