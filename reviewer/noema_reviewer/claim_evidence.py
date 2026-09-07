"""Produce and admit exact-claim evidence at the Noema reviewer boundary.

Trusted workflow producers create canonical artifacts and frozen receipts. The
untrusted model may cite only a receipt ID; it never supplies the authoritative
receipt payload, evidence kind, producer identity, or artifact path.
"""

from __future__ import annotations

import hashlib
import json
import re
from base64 import b64decode, b64encode
from binascii import Error as Base64Error
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from types import MappingProxyType
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


@dataclass(frozen=True)
class ProducedClaimEvidence:
    """One producer-owned receipt plus its canonical upload artifact bytes."""

    receipt: ClaimEvidenceReceipt
    artifact: bytes


class VerifiedClaimEvidenceIndex:
    """Immutable receipt index constructible only by manifest verification."""

    __slots__ = ("artifacts", "claims", "receipts")

    def __init__(self) -> None:
        """Reject direct construction that would bypass manifest verification."""
        raise TypeError("use verify_claim_evidence_manifest")

    @classmethod
    def _from_verified(
        cls,
        *,
        receipts: Mapping[str, ClaimEvidenceReceipt],
        artifacts: Mapping[str, bytes],
        claims: Mapping[str, str],
    ) -> "VerifiedClaimEvidenceIndex":
        """Build one immutable index after all envelope checks pass."""
        instance = object.__new__(cls)
        instance.receipts = MappingProxyType(dict(receipts))
        instance.artifacts = MappingProxyType(dict(artifacts))
        instance.claims = MappingProxyType(dict(claims))
        return instance


def _sha256_bytes(value: bytes) -> str:
    """Return the lowercase SHA-256 digest of exact bytes."""
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    """Return the lowercase SHA-256 digest of exact UTF-8 claim bytes."""
    return _sha256_bytes(value.encode("utf-8"))


def _utc_text(value: datetime) -> str:
    """Return one canonical UTC timestamp for a producer artifact."""
    if value.utcoffset() is None:
        raise ValueError("claim evidence artifact timestamps must be timezone-aware")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _canonical_artifact(payload: Mapping[str, object]) -> bytes:
    """Serialize one semantic receipt payload with deterministic exact bytes."""
    return (
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def _common_artifact_payload(
    *,
    receipt_id: str,
    evidence_kind: EvidenceKind,
    repository: str,
    head_sha: str,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    claim: str,
    producer_id: str,
    producer_version: str,
    policy_version: str,
    issued_at: datetime,
    expires_at: datetime,
) -> dict[str, object]:
    """Return shared semantic fields sealed into every evidence artifact."""
    return {
        "schema_version": 1,
        "receipt_id": receipt_id,
        "evidence_kind": evidence_kind.value,
        "repository": repository,
        "head_sha": head_sha,
        "workflow_ref": workflow_ref,
        "run_id": run_id,
        "run_attempt": run_attempt,
        "claim_sha256": sha256_text(claim),
        "producer_id": producer_id,
        "producer_version": producer_version,
        "policy_version": policy_version,
        "issued_at": _utc_text(issued_at),
        "expires_at": _utc_text(expires_at),
    }


def _receipt_identity(
    payload: Mapping[str, object], artifact: bytes
) -> dict[str, object]:
    """Add exact canonical artifact identity to shared receipt fields."""
    return {
        key: payload[key]
        for key in (
            "schema_version",
            "receipt_id",
            "repository",
            "head_sha",
            "workflow_ref",
            "run_id",
            "run_attempt",
            "claim_sha256",
            "producer_id",
            "producer_version",
            "policy_version",
            "issued_at",
            "expires_at",
        )
    } | {
        "artifact_sha256": _sha256_bytes(artifact),
        "artifact_size": len(artifact),
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
) -> ProducedClaimEvidence:
    """Seal execution semantics and output digests into one canonical artifact."""
    stdout_sha256 = _sha256_bytes(stdout)
    stderr_sha256 = _sha256_bytes(stderr)
    payload = _common_artifact_payload(
        receipt_id=receipt_id,
        evidence_kind=EvidenceKind.EXECUTION,
        repository=repository,
        head_sha=head_sha,
        workflow_ref=workflow_ref,
        run_id=run_id,
        run_attempt=run_attempt,
        claim=claim,
        producer_id=producer_id,
        producer_version=producer_version,
        policy_version=policy_version,
        issued_at=issued_at,
        expires_at=expires_at,
    ) | {
        "argv": list(argv),
        "tool_identity": tool_identity,
        "tool_version": tool_version,
        "exit_code": exit_code,
        "stdout_sha256": stdout_sha256,
        "stderr_sha256": stderr_sha256,
        "isolation_policy": isolation_policy,
        "network_policy": network_policy,
    }
    artifact = _canonical_artifact(payload)
    receipt = ExecutionClaimReceipt(
        **_receipt_identity(payload, artifact),
        evidence_kind=EvidenceKind.EXECUTION,
        argv=tuple(argv),
        tool_identity=tool_identity,
        tool_version=tool_version,
        exit_code=exit_code,
        stdout_sha256=stdout_sha256,
        stderr_sha256=stderr_sha256,
        isolation_policy=isolation_policy,
        network_policy=network_policy,
    )
    return ProducedClaimEvidence(receipt=receipt, artifact=artifact)


def produce_research_claim_receipt(
    *,
    receipt_id: str,
    repository: str,
    head_sha: str,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    claim: str,
    producer_id: str,
    producer_version: str,
    policy_version: str,
    issued_at: datetime,
    expires_at: datetime,
    source_uri: str,
    retrieved_content: bytes,
    excerpt: bytes,
    retrieval_policy: str,
) -> ProducedClaimEvidence:
    """Seal content-addressed retrieval semantics into one canonical artifact."""
    source_revision = f"sha256:{_sha256_bytes(retrieved_content)}"
    excerpt_sha256 = _sha256_bytes(excerpt)
    payload = _common_artifact_payload(
        receipt_id=receipt_id,
        evidence_kind=EvidenceKind.RESEARCH,
        repository=repository,
        head_sha=head_sha,
        workflow_ref=workflow_ref,
        run_id=run_id,
        run_attempt=run_attempt,
        claim=claim,
        producer_id=producer_id,
        producer_version=producer_version,
        policy_version=policy_version,
        issued_at=issued_at,
        expires_at=expires_at,
    ) | {
        "source_uri": source_uri,
        "source_revision": source_revision,
        "excerpt_sha256": excerpt_sha256,
        "retrieval_policy": retrieval_policy,
    }
    artifact = _canonical_artifact(payload)
    receipt = ResearchClaimReceipt(
        **_receipt_identity(payload, artifact),
        evidence_kind=EvidenceKind.RESEARCH,
        source_uri=source_uri,
        source_revision=source_revision,
        excerpt_sha256=excerpt_sha256,
        retrieval_policy=retrieval_policy,
    )
    return ProducedClaimEvidence(receipt=receipt, artifact=artifact)


def index_claim_evidence_receipts(
    receipts: Sequence[ClaimEvidenceReceipt],
) -> dict[str, ClaimEvidenceReceipt]:
    """Index unique producer objects from an authenticated out-of-band manifest."""
    indexed: dict[str, ClaimEvidenceReceipt] = {}
    for receipt in receipts:
        if not isinstance(
            receipt,
            (SourceClaimReceipt, ExecutionClaimReceipt, ResearchClaimReceipt),
        ):
            raise TypeError("trusted claim evidence index requires receipt objects")
        if receipt.receipt_id in indexed:
            raise ValueError("duplicate claim evidence receipt ID")
        indexed[receipt.receipt_id] = receipt
    return indexed


def produce_claim_evidence_manifest(
    entries: Sequence[tuple[str, ProducedClaimEvidence]],
) -> bytes:
    """Serialize producer results into one canonical authenticated-handoff body."""
    payload_entries: list[dict[str, object]] = []
    receipt_ids: set[str] = set()
    for claim, produced in entries:
        receipt = produced.receipt
        if receipt.receipt_id in receipt_ids:
            raise ValueError("duplicate claim evidence receipt ID")
        if receipt.claim_sha256 != sha256_text(claim):
            raise ValueError("claim evidence receipt claim digest mismatch")
        receipt_ids.add(receipt.receipt_id)
        payload_entries.append(
            {
                "artifact_base64": b64encode(produced.artifact).decode("ascii"),
                "claim": claim,
                "receipt": receipt.model_dump(mode="json"),
            }
        )
    return _canonical_artifact(
        {"schema_version": 1, "entries": payload_entries}
    )


def verify_claim_evidence_manifest(
    manifest: bytes,
    *,
    expected_manifest_sha256: str,
    expected_repository: str,
    expected_head_sha: str,
    expected_workflow_ref: str,
    expected_run_id: int,
    expected_run_attempt: int,
    expected_producers: Mapping[str, EvidenceKind],
) -> VerifiedClaimEvidenceIndex:
    """Verify an authenticated manifest and return its immutable receipt index.

    The expected manifest digest comes from the already authenticated OpenCode
    artifact handoff. Producer identity and allowed evidence kind come from
    reviewed caller policy, never from model output or the manifest itself.

    Raises:
        ValueError: If manifest bytes, shape, identity, producer policy, claim,
            artifact, or canonical serialization do not match exactly.
    """
    if not isinstance(expected_manifest_sha256, str) or not re.fullmatch(
        _SHA256_PATTERN, expected_manifest_sha256
    ):
        raise ValueError("claim evidence manifest expected digest is invalid")
    if _sha256_bytes(manifest) != expected_manifest_sha256:
        raise ValueError("claim evidence manifest digest mismatch")
    try:
        payload = json.loads(manifest)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("claim evidence manifest is not valid JSON") from exc
    if (
        not isinstance(payload, dict)
        or set(payload) != {"schema_version", "entries"}
        or payload.get("schema_version") != 1
        or not isinstance(payload.get("entries"), list)
    ):
        raise ValueError("claim evidence manifest shape is invalid")
    if manifest != _canonical_artifact(payload):
        raise ValueError("claim evidence manifest is not canonical")

    receipts: list[ClaimEvidenceReceipt] = []
    artifacts: dict[str, bytes] = {}
    claims: dict[str, str] = {}
    for entry in payload["entries"]:
        if not isinstance(entry, dict) or set(entry) != {
            "artifact_base64",
            "claim",
            "receipt",
        }:
            raise ValueError("claim evidence manifest entry shape is invalid")
        claim = entry["claim"]
        encoded_artifact = entry["artifact_base64"]
        if not isinstance(claim, str) or not isinstance(encoded_artifact, str):
            raise ValueError("claim evidence manifest entry type is invalid")
        try:
            artifact = b64decode(encoded_artifact, validate=True)
        except (Base64Error, ValueError) as exc:
            raise ValueError("claim evidence manifest artifact is invalid base64") from exc
        if b64encode(artifact).decode("ascii") != encoded_artifact:
            raise ValueError("claim evidence manifest artifact base64 is not canonical")
        receipt = _RECEIPT_ADAPTER.validate_python(entry["receipt"])
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
        if expected_producers.get(receipt.producer_id) != receipt.evidence_kind:
            raise ValueError("claim evidence receipt producer policy mismatch")
        if receipt.claim_sha256 != sha256_text(claim):
            raise ValueError("claim evidence receipt claim digest mismatch")
        if receipt.artifact_size != len(artifact):
            raise ValueError("claim evidence receipt artifact size mismatch")
        if receipt.artifact_sha256 != _sha256_bytes(artifact):
            raise ValueError("claim evidence receipt artifact digest mismatch")
        if artifact != _canonical_artifact(_artifact_payload(receipt)):
            raise ValueError("claim evidence receipt semantic artifact mismatch")
        receipts.append(receipt)
        artifacts[receipt.receipt_id] = artifact
        claims[receipt.receipt_id] = claim
    indexed = index_claim_evidence_receipts(receipts)
    return VerifiedClaimEvidenceIndex._from_verified(
        receipts=indexed,
        artifacts=artifacts,
        claims=claims,
    )


def _artifact_payload(receipt: ClaimEvidenceReceipt) -> dict[str, object]:
    """Reconstruct the exact semantic artifact covered by a trusted receipt."""
    common = {
        "schema_version": receipt.schema_version,
        "receipt_id": receipt.receipt_id,
        "evidence_kind": receipt.evidence_kind.value,
        "repository": receipt.repository,
        "head_sha": receipt.head_sha,
        "workflow_ref": receipt.workflow_ref,
        "run_id": receipt.run_id,
        "run_attempt": receipt.run_attempt,
        "claim_sha256": receipt.claim_sha256,
        "producer_id": receipt.producer_id,
        "producer_version": receipt.producer_version,
        "policy_version": receipt.policy_version,
        "issued_at": _utc_text(receipt.issued_at),
        "expires_at": _utc_text(receipt.expires_at),
    }
    if isinstance(receipt, ExecutionClaimReceipt):
        return common | {
            "argv": list(receipt.argv),
            "tool_identity": receipt.tool_identity,
            "tool_version": receipt.tool_version,
            "exit_code": receipt.exit_code,
            "stdout_sha256": receipt.stdout_sha256,
            "stderr_sha256": receipt.stderr_sha256,
            "isolation_policy": receipt.isolation_policy,
            "network_policy": receipt.network_policy,
        }
    if isinstance(receipt, ResearchClaimReceipt):
        return common | {
            "source_uri": receipt.source_uri,
            "source_revision": receipt.source_revision,
            "excerpt_sha256": receipt.excerpt_sha256,
            "retrieval_policy": receipt.retrieval_policy,
        }
    return common | {
        "source_path": receipt.source_path,
        "source_line": receipt.source_line,
        "source_line_sha256": receipt.source_line_sha256,
    }


def admit_claim_evidence(
    receipt_id: str,
    *,
    trusted_index: VerifiedClaimEvidenceIndex,
    claim: str,
    admitted_at: datetime,
    required_kind: EvidenceKind,
) -> ClaimEvidenceReceipt:
    """Resolve a model citation from trusted receipts and admit exact evidence.

    ``trusted_index`` can only be created by exact manifest verification. The
    model controls only ``receipt_id`` and exact claim text; it cannot submit or
    relabel a receipt payload, artifact, producer identity, or evidence kind.

    Raises:
        ValueError: If the cited receipt is absent or any exact identity,
            validity, kind, claim, semantic artifact, or artifact bytes differ.
    """
    if not isinstance(trusted_index, VerifiedClaimEvidenceIndex):
        raise TypeError("claim evidence admission requires a verified manifest index")
    receipt = trusted_index.receipts.get(receipt_id)
    if receipt is None:
        raise ValueError("claim evidence receipt is missing from trusted manifest")
    if admitted_at.utcoffset() is None:
        raise ValueError("claim evidence admission time must be timezone-aware")
    if admitted_at < receipt.issued_at or admitted_at >= receipt.expires_at:
        raise ValueError("claim evidence receipt is not valid at admission time")
    if receipt.evidence_kind != required_kind:
        raise ValueError("claim evidence receipt kind mismatch")
    if trusted_index.claims[receipt_id] != claim or receipt.claim_sha256 != sha256_text(claim):
        raise ValueError("claim evidence receipt claim digest mismatch")
    return receipt
