"""Adapt trusted retrieval bytes into bounded research claim evidence.

This module owns only Noema's evidence-integrity boundary. Retrieval, source
selection, network policy, and external research truth remain with the
canonical retrieval producer. The adapter accepts already retrieved immutable
bytes and refuses to describe arbitrary bytes as an excerpt of that source.
"""

from __future__ import annotations

from datetime import datetime

from .claim_evidence import ProducedClaimEvidence, produce_research_claim_receipt


_PRODUCER_ID = "trusted-research-retrieval"
_PRODUCER_VERSION = "v1"


def produce_trusted_research_claim_receipt(
    *,
    receipt_id: str,
    repository: str,
    head_sha: str,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    claim: str,
    policy_version: str,
    issued_at: datetime,
    expires_at: datetime,
    source_uri: str,
    retrieved_content: bytes,
    excerpt: bytes,
    retrieval_policy: str,
) -> ProducedClaimEvidence:
    """Seal one exact, non-empty byte slice of an immutable retrieval.

    The generic receipt kernel content-addresses bytes supplied by a trusted
    producer; it does not itself perform retrieval. This adapter adds the
    producer-specific invariant needed before `trusted-research-retrieval` can
    become finding authority: the cited excerpt must occur verbatim in the
    exact retrieved bytes whose digest becomes ``source_revision``.

    No decoding, Unicode normalization, whitespace folding, or paraphrase
    matching is permitted because any such transform would create a second
    interpretation authority inside Noema.
    """
    if not isinstance(retrieved_content, bytes) or not isinstance(excerpt, bytes):
        raise TypeError("trusted research content and excerpt must be exact bytes")
    if not excerpt:
        raise ValueError("trusted research excerpt must not be empty")
    if excerpt not in retrieved_content:
        raise ValueError("trusted research excerpt is not present in retrieved content")

    return produce_research_claim_receipt(
        receipt_id=receipt_id,
        repository=repository,
        head_sha=head_sha,
        workflow_ref=workflow_ref,
        run_id=run_id,
        run_attempt=run_attempt,
        claim=claim,
        producer_id=_PRODUCER_ID,
        producer_version=_PRODUCER_VERSION,
        policy_version=policy_version,
        issued_at=issued_at,
        expires_at=expires_at,
        source_uri=source_uri,
        retrieved_content=retrieved_content,
        excerpt=excerpt,
        retrieval_policy=retrieval_policy,
    )
