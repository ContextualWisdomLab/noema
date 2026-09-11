"""Regression coverage for producer-authenticated research evidence integrity."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from noema_reviewer.claim_evidence import produce_research_claim_receipt


def test_research_excerpt_must_be_exactly_present_in_retrieved_content() -> None:
    """Reject a cited excerpt whose bytes never occurred in the fetched source."""
    issued_at = datetime(2026, 9, 11, tzinfo=timezone.utc)

    with pytest.raises(ValueError, match="excerpt"):
        produce_research_claim_receipt(
            receipt_id="research-excerpt-binding",
            repository="ContextualWisdomLab/noema",
            head_sha="a" * 40,
            workflow_ref=(
                "ContextualWisdomLab/noema/.github/workflows/central-review.yml@"
                + "b" * 40
            ),
            run_id=1,
            run_attempt=1,
            claim="The cited source contains the producer-reported excerpt.",
            producer_id="trusted-research-retrieval",
            producer_version="v1",
            policy_version="review-evidence-v1",
            issued_at=issued_at,
            expires_at=issued_at + timedelta(hours=1),
            source_uri="https://example.com/authoritative-source",
            retrieved_content=b"authoritative source bytes\n",
            excerpt=b"fabricated excerpt absent from source",
            retrieval_policy="content-addressed-v1",
        )
