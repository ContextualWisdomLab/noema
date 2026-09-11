"""Regression coverage for producer-authenticated research evidence integrity."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from noema_reviewer import produce_trusted_research_claim_receipt


ISSUED_AT = datetime(2026, 9, 11, tzinfo=timezone.utc)
COMMON = {
    "receipt_id": "research-excerpt-binding",
    "repository": "ContextualWisdomLab/noema",
    "head_sha": "a" * 40,
    "workflow_ref": (
        "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
    ),
    "run_id": 1,
    "run_attempt": 1,
    "claim": "The cited source contains the producer-reported excerpt.",
    "policy_version": "review-evidence-v1",
    "issued_at": ISSUED_AT,
    "expires_at": ISSUED_AT + timedelta(hours=1),
    "source_uri": "https://example.com/authoritative-source",
    "retrieval_policy": "content-addressed-v1",
}


def test_trusted_research_excerpt_must_be_present_in_retrieved_content() -> None:
    """Reject a cited excerpt whose exact bytes never occurred in the source."""
    with pytest.raises(ValueError, match="excerpt"):
        produce_trusted_research_claim_receipt(
            **COMMON,
            retrieved_content=b"authoritative source bytes\n",
            excerpt=b"fabricated excerpt absent from source",
        )


def test_trusted_research_excerpt_must_not_be_empty() -> None:
    """An empty byte string cannot stand in for bounded cited evidence."""
    with pytest.raises(ValueError, match="excerpt"):
        produce_trusted_research_claim_receipt(
            **COMMON,
            retrieved_content=b"authoritative source bytes\n",
            excerpt=b"",
        )


def test_trusted_research_receipt_keeps_exact_source_and_excerpt_identity() -> None:
    """Exact source bytes and their cited slice remain independently addressable."""
    retrieved = b"prefix\nexact cited bytes\nsuffix\n"
    excerpt = b"exact cited bytes"

    produced = produce_trusted_research_claim_receipt(
        **COMMON,
        retrieved_content=retrieved,
        excerpt=excerpt,
    )

    assert produced.receipt.producer_id == "trusted-research-retrieval"
    assert produced.receipt.producer_version == "v1"
    assert produced.receipt.source_revision == "sha256:" + hashlib.sha256(
        retrieved
    ).hexdigest()
    assert produced.receipt.excerpt_sha256 == hashlib.sha256(excerpt).hexdigest()
