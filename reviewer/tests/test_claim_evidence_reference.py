"""Tests for canonical model-visible claim-evidence receipt references."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from noema_reviewer.claim_evidence import (
    EvidenceKind,
    ProducedClaimEvidence,
    VerifiedClaimEvidenceIndex,
    produce_claim_evidence_manifest,
    produce_execution_claim_receipt,
    verify_claim_evidence_manifest,
)
from noema_reviewer.claim_evidence_reference import (
    admit_claim_evidence_reference,
    parse_claim_evidence_reference,
)
from noema_reviewer.source_claim_evidence import produce_source_claim_receipt


CLAIM = (
    "--locked is not a valid invocation: --locked is not accepted by the "
    "generate-lockfile subcommand. This will always fail, breaking the workflow."
)
SYNONYM = "The generate-lockfile subcommand rejects --locked, so this workflow cannot succeed."
HEAD = "a" * 40
WORKFLOW = "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
ISSUED = datetime(2026, 9, 7, tzinfo=timezone.utc)
EXPIRES = ISSUED + timedelta(hours=1)


def _execution_bundle(claim: str = CLAIM, *, receipt_id: str = "execution-1") -> ProducedClaimEvidence:
    """Return one producer-issued execution receipt for an exact claim."""
    return produce_execution_claim_receipt(
        receipt_id=receipt_id,
        repository="ContextualWisdomLab/ConceptWeave",
        head_sha=HEAD,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        claim=claim,
        producer_id="sandboxed-verify",
        producer_version="v1",
        policy_version="review-evidence-v1",
        issued_at=ISSUED,
        expires_at=EXPIRES,
        argv=["cargo", "generate-lockfile", "--locked"],
        tool_identity="cargo",
        tool_version="1.90.0",
        exit_code=1,
        stdout=b"",
        stderr=b"unsupported\n",
        isolation_policy="sandboxed-verify-v1",
        network_policy="disabled",
    )


def _source_bundle() -> ProducedClaimEvidence:
    """Return one producer-issued current-head source receipt."""
    return produce_source_claim_receipt(
        receipt_id="source-1",
        repository="ContextualWisdomLab/ConceptWeave",
        head_sha=HEAD,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        claim=CLAIM,
        producer_id="changed-source-map",
        producer_version="v1",
        policy_version="review-evidence-v1",
        issued_at=ISSUED,
        expires_at=EXPIRES,
        source_path=".github/workflows/ci.yml",
        source_line=42,
        source_line_bytes=b"cargo generate-lockfile --locked\n",
    )


def _verified_index(
    claim: str,
    bundle: ProducedClaimEvidence,
) -> VerifiedClaimEvidenceIndex:
    """Authenticate one producer manifest against caller-owned workflow identity."""
    manifest = produce_claim_evidence_manifest([(claim, bundle)])
    return verify_claim_evidence_manifest(
        manifest,
        expected_manifest_sha256=hashlib.sha256(manifest).hexdigest(),
        expected_repository="ContextualWisdomLab/ConceptWeave",
        expected_head_sha=HEAD,
        expected_workflow_ref=WORKFLOW,
        expected_run_id=12,
        expected_run_attempt=1,
        expected_producers={bundle.receipt.producer_id: bundle.receipt.evidence_kind},
    )


def test_exact_receipt_marker_admits_the_original_external_behavior_claim() -> None:
    """The original consumer RED becomes admissible only through its exact receipt."""
    bundle = _execution_bundle()
    receipt = admit_claim_evidence_reference(
        f"{CLAIM} [receipt:{bundle.receipt.receipt_id}]",
        trusted_index=_verified_index(CLAIM, bundle),
        admitted_at=ISSUED + timedelta(minutes=1),
        required_kind=EvidenceKind.EXECUTION,
    )
    assert receipt == bundle.receipt


def test_synonym_cannot_reuse_a_receipt_for_different_claim_bytes() -> None:
    """Semantic similarity cannot substitute for exact producer-authenticated claim bytes."""
    bundle = _execution_bundle()
    with pytest.raises(ValueError, match="claim digest"):
        admit_claim_evidence_reference(
            f"{SYNONYM} [receipt:{bundle.receipt.receipt_id}]",
            trusted_index=_verified_index(CLAIM, bundle),
            admitted_at=ISSUED + timedelta(minutes=1),
            required_kind=EvidenceKind.EXECUTION,
        )

    synonym_bundle = _execution_bundle(SYNONYM, receipt_id="execution-synonym")
    assert (
        admit_claim_evidence_reference(
            f"{SYNONYM} [receipt:{synonym_bundle.receipt.receipt_id}]",
            trusted_index=_verified_index(SYNONYM, synonym_bundle),
            admitted_at=ISSUED + timedelta(minutes=1),
            required_kind=EvidenceKind.EXECUTION,
        )
        == synonym_bundle.receipt
    )


def test_caller_owned_kind_prevents_source_receipt_from_authorizing_execution() -> None:
    """A model-visible source citation cannot self-promote into execution authority."""
    bundle = _source_bundle()
    with pytest.raises(ValueError, match="kind mismatch"):
        admit_claim_evidence_reference(
            f"{CLAIM} [receipt:{bundle.receipt.receipt_id}]",
            trusted_index=_verified_index(CLAIM, bundle),
            admitted_at=ISSUED + timedelta(minutes=1),
            required_kind=EvidenceKind.EXECUTION,
        )


def test_marker_only_sandbox_result_is_not_a_trusted_receipt() -> None:
    """A sandboxed_verify-style text marker cannot manufacture producer evidence."""
    bundle = _execution_bundle()
    with pytest.raises(ValueError, match="missing from trusted manifest"):
        admit_claim_evidence_reference(
            "sandboxed_verify: success [receipt:sandboxed-verify-result]",
            trusted_index=_verified_index(CLAIM, bundle),
            admitted_at=ISSUED + timedelta(minutes=1),
            required_kind=EvidenceKind.EXECUTION,
        )


@pytest.mark.parametrize(
    "reference",
    [
        CLAIM,
        f"{CLAIM}[receipt:execution-1]",
        f"{CLAIM}  [receipt:execution-1]",
        f"{CLAIM} [RECEIPT:execution-1]",
        f"{CLAIM}\n[receipt:execution-1]",
        f"{CLAIM} [receipt:execution-1] trailing",
    ],
)
def test_noncanonical_or_missing_receipt_marker_fails_closed(reference: str) -> None:
    """Only one exact trailing receipt marker is admitted as model-visible syntax."""
    with pytest.raises(ValueError, match="canonical"):
        parse_claim_evidence_reference(reference)


def test_multiple_receipt_markers_fail_closed() -> None:
    """A model cannot offer alternate receipt IDs and leave authority selection ambiguous."""
    with pytest.raises(ValueError, match="exactly one"):
        parse_claim_evidence_reference(
            f"{CLAIM} [receipt:first] [receipt:second]"
        )


def test_non_string_reference_is_rejected_before_parsing() -> None:
    """Structured model objects cannot bypass the canonical text reference port."""
    with pytest.raises(TypeError, match="string"):
        parse_claim_evidence_reference({"receipt": "execution-1"})  # type: ignore[arg-type]
