"""Canonical producer for exact current-head source evidence."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime

from .claim_evidence import (
    EvidenceKind,
    ProducedClaimEvidence,
    SourceClaimReceipt,
    _canonical_artifact,
    _common_artifact_payload,
    _receipt_identity,
    _sha256_bytes,
)


def produce_source_claim_receipt(
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
    source_path: str,
    source_line: int,
    source_line_bytes: bytes,
) -> ProducedClaimEvidence:
    """Seal exact current-head source-line bytes into one canonical receipt artifact."""
    payload: Mapping[str, object] = _common_artifact_payload(
        receipt_id=receipt_id,
        evidence_kind=EvidenceKind.SOURCE,
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
        "source_path": source_path,
        "source_line": source_line,
        "source_line_sha256": _sha256_bytes(source_line_bytes),
    }
    artifact = _canonical_artifact(payload)
    receipt = SourceClaimReceipt(
        **_receipt_identity(payload, artifact),
        evidence_kind=EvidenceKind.SOURCE,
        source_path=source_path,
        source_line=source_line,
        source_line_sha256=payload["source_line_sha256"],
    )
    return ProducedClaimEvidence(receipt=receipt, artifact=artifact)
