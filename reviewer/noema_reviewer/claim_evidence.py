"""Exact-claim evidence receipts admitted by the Noema reviewer boundary.

Receipt producers run outside the untrusted model. This module validates their
sealed metadata and exact bytes; a model citation or self-declared claim kind is
never evidence authority by itself.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator


_SHA256_PATTERN = r"^[0-9a-f]{64}$"
_HEAD_SHA_PATTERN = r"^[0-9a-f]{40}$"
_REPOSITORY_PATTERN = r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
_WORKFLOW_REF_PATTERN = (
    r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\.github/workflows/"
    r"[A-Za-z0-9_.-]+\.ya?ml@[0-9a-f]{40}$"
)
_SLUG_PATTERN = r"^[a-z0-9][a-z0-9._-]{0,79}$"
_NonEmptyText = Annotated[str, Field(min_length=1)]


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
    producer_id: str = Field(pattern=_SLUG_PATTERN)
    producer_version: str = Field(pattern=_SLUG_PATTERN)
    policy_version: str = Field(pattern=_SLUG_PATTERN)
    issued_at: datetime
    expires_at: datetime

    @model_validator(mode="after")
    def require_bounded_aware_validity(self) -> "_ReceiptIdentity":
        """Reject ambiguous or unbounded receipt validity windows."""
        if self.issued_at.utcoffset() is None or self.expires_at.utcoffset() is None:
            raise ValueError("claim evidence receipt timestamps must be timezone-aware")
        if self.expires_at <= self.issued_at:
            raise ValueError("claim evidence receipt expiry must follow issue time")
        return self


class SourceClaimReceipt(_ReceiptIdentity):
    """Receipt proving exact current-head source bytes, not external behavior."""

    evidence_kind: Literal[EvidenceKind.SOURCE]
    source_path: str = Field(min_length=1)
    source_line: int = Field(gt=0)
    source_line_sha256: str = Field(pattern=_SHA256_PATTERN)


class ExecutionClaimReceipt(_ReceiptIdentity):
    """Receipt proving one sandboxed execution result and its bounded output."""

    evidence_kind: Literal[EvidenceKind.EXECUTION]
    argv: tuple[_NonEmptyText, ...] = Field(min_length=1)
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
    source_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    excerpt_sha256: str = Field(pattern=_SHA256_PATTERN)
    retrieval_policy: str = Field(min_length=1)


ClaimEvidenceReceipt = Annotated[
    SourceClaimReceipt | ExecutionClaimReceipt | ResearchClaimReceipt,
    Field(discriminator="evidence_kind"),
]
_RECEIPT_ADAPTER = TypeAdapter(ClaimEvidenceReceipt)


def _sha256_bytes(value: bytes) -> str:
    """Return the lowercase SHA-256 digest of exact bytes."""
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    """Return the lowercase SHA-256 digest of exact UTF-8 claim bytes."""
    return _sha256_bytes(value.encode("utf-8"))


def _identity_payload(
    *,
    receipt_id: str,
    repository: str,
    head_sha: str,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    claim: str,
    artifact: bytes,
    producer_id: str,
    producer_version: str,
    policy_version: str,
    issued_at: datetime,
    expires_at: datetime,
) -> dict[str, object]:
    """Build exact shared receipt identity from trusted producer inputs."""
    return {
        "schema_version": 1,
        "receipt_id": receipt_id,
        "repository": repository,
        "head_sha": head_sha,
        "workflow_ref": workflow_ref,
        "run_id": run_id,
        "run_attempt": run_attempt,
        "claim_sha256": sha256_text(claim),
        "artifact_sha256": _sha256_bytes(artifact),
        "artifact_size": len(artifact),
        "producer_id": producer_id,
        "producer_version": producer_version,
        "policy_version": policy_version,
        "issued_at": issued_at,
        "expires_at": expires_at,
    }


def produce_execution_claim_receipt(
    *,
    receipt_id: str,
    repository: str,
    head_sha: str,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    claim: str,
    artifact: bytes,
    producer_id: str,
    producer_version: str,
    policy_version: str,
    issued_at: datetime,
    expires_at: datetime,
    argv: Sequence[str],
    tool_identity: str,
    tool_version: str,
    exit_code: int,
    stdout: bytes,
    stderr: bytes,
    isolation_policy: str,
    network_policy: str,
) -> ExecutionClaimReceipt:
    """Seal an execution receipt from exact trusted workflow and result bytes."""
    return ExecutionClaimReceipt(
        **_identity_payload(
            receipt_id=receipt_id,
            repository=repository,
            head_sha=head_sha,
            workflow_ref=workflow_ref,
            run_id=run_id,
            run_attempt=run_attempt,
            claim=claim,
            artifact=artifact,
            producer_id=producer_id,
            producer_version=producer_version,
            policy_version=policy_version,
            issued_at=issued_at,
            expires_at=expires_at,
        ),
        evidence_kind=EvidenceKind.EXECUTION,
        argv=tuple(argv),
        tool_identity=tool_identity,
        tool_version=tool_version,
        exit_code=exit_code,
        stdout_sha256=_sha256_bytes(stdout),
        stderr_sha256=_sha256_bytes(stderr),
        isolation_policy=isolation_policy,
        network_policy=network_policy,
    )


def produce_research_claim_receipt(
    *,
    receipt_id: str,
    repository: str,
    head_sha: str,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    claim: str,
    artifact: bytes,
    producer_id: str,
    producer_version: str,
    policy_version: str,
    issued_at: datetime,
    expires_at: datetime,
    source_uri: str,
    excerpt: bytes,
    retrieval_policy: str,
) -> ResearchClaimReceipt:
    """Seal a research receipt with content-addressed source and excerpt bytes."""
    return ResearchClaimReceipt(
        **_identity_payload(
            receipt_id=receipt_id,
            repository=repository,
            head_sha=head_sha,
            workflow_ref=workflow_ref,
            run_id=run_id,
            run_attempt=run_attempt,
            claim=claim,
            artifact=artifact,
            producer_id=producer_id,
            producer_version=producer_version,
            policy_version=policy_version,
            issued_at=issued_at,
            expires_at=expires_at,
        ),
        evidence_kind=EvidenceKind.RESEARCH,
        source_uri=source_uri,
        source_revision=f"sha256:{_sha256_bytes(artifact)}",
        excerpt_sha256=_sha256_bytes(excerpt),
        retrieval_policy=retrieval_policy,
    )


def index_claim_evidence_receipts(
    payloads: Sequence[object],
) -> dict[str, ClaimEvidenceReceipt]:
    """Validate receipt schemas and index unique producer-issued identities."""
    indexed: dict[str, ClaimEvidenceReceipt] = {}
    for payload in payloads:
        receipt = _RECEIPT_ADAPTER.validate_python(payload)
        if receipt.receipt_id in indexed:
            raise ValueError("duplicate claim evidence receipt ID")
        indexed[receipt.receipt_id] = receipt
    return indexed


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
    expected_producer_id: str,
    admitted_at: datetime,
    required_kind: EvidenceKind,
) -> ClaimEvidenceReceipt:
    """Validate a sealed receipt against caller-owned identity and exact bytes.

    The required kind, producer, and observation time come from the trusted
    manifest channel, never from model output. The model may only cite a receipt
    ID after this admission passes.

    Raises:
        ValueError: If exact identity, validity, kind, claim bytes, or artifact
            bytes do not match the producer receipt.
        pydantic.ValidationError: If the receipt schema itself is malformed.
    """
    receipt = _RECEIPT_ADAPTER.validate_python(payload)
    observed_identity = (
        receipt.repository,
        receipt.head_sha,
        receipt.workflow_ref,
        receipt.run_id,
        receipt.run_attempt,
        receipt.producer_id,
    )
    expected_identity = (
        expected_repository,
        expected_head_sha,
        expected_workflow_ref,
        expected_run_id,
        expected_run_attempt,
        expected_producer_id,
    )
    if observed_identity != expected_identity:
        raise ValueError("claim evidence receipt identity mismatch")
    if admitted_at.utcoffset() is None:
        raise ValueError("claim evidence admission time must be timezone-aware")
    if admitted_at < receipt.issued_at or admitted_at >= receipt.expires_at:
        raise ValueError("claim evidence receipt is not valid at admission time")
    if receipt.evidence_kind != required_kind:
        raise ValueError("claim evidence receipt kind mismatch")
    if receipt.claim_sha256 != sha256_text(claim):
        raise ValueError("claim evidence receipt claim digest mismatch")
    if receipt.artifact_size != len(artifact):
        raise ValueError("claim evidence receipt artifact size mismatch")
    if receipt.artifact_sha256 != _sha256_bytes(artifact):
        raise ValueError("claim evidence receipt artifact digest mismatch")
    return receipt
