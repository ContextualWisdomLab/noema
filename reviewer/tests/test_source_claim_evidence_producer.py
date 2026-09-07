"""Regression coverage for canonical source-claim evidence production."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

from noema_reviewer import EvidenceKind, ProducedClaimEvidence, produce_source_claim_receipt


ISSUED = datetime(2026, 9, 7, tzinfo=timezone.utc)
EXPIRES = ISSUED + timedelta(hours=1)
HEAD = "a" * 40
WORKFLOW = "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40


def test_source_producer_seals_exact_line_bytes_into_canonical_artifact() -> None:
    """Source evidence must come from the same canonical producer path as other kinds."""
    line = b'run: cargo generate-lockfile --locked\n'
    produced = produce_source_claim_receipt(
        receipt_id="source-1",
        repository="ContextualWisdomLab/ConceptWeave",
        head_sha=HEAD,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        claim="the workflow invokes cargo generate-lockfile --locked",
        producer_id="changed-source-map",
        producer_version="v1",
        policy_version="review-evidence-v1",
        issued_at=ISSUED,
        expires_at=EXPIRES,
        source_path=".github/workflows/ci.yml",
        source_line=42,
        source_line_bytes=line,
    )

    assert isinstance(produced, ProducedClaimEvidence)
    assert produced.receipt.evidence_kind is EvidenceKind.SOURCE
    assert produced.receipt.source_line_sha256 == hashlib.sha256(line).hexdigest()
    payload = json.loads(produced.artifact)
    assert payload["source_path"] == ".github/workflows/ci.yml"
    assert payload["source_line"] == 42
    assert payload["source_line_sha256"] == hashlib.sha256(line).hexdigest()
    assert produced.receipt.artifact_sha256 == hashlib.sha256(produced.artifact).hexdigest()
