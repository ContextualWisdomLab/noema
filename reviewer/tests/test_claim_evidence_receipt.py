"""Tests for exact-claim reviewer evidence receipt admission."""

from __future__ import annotations

import hashlib

import pytest
from pydantic import ValidationError

from noema_reviewer.claim_evidence import (
    EvidenceKind,
    ExecutionClaimReceipt,
    ResearchClaimReceipt,
    SourceClaimReceipt,
    admit_claim_evidence,
    sha256_text,
)


CLAIM = (
    "--locked is not a valid invocation: --locked is not accepted by the "
    "generate-lockfile subcommand. This will always fail, breaking the workflow."
)
ARTIFACT = b"bounded producer output\n"
HEAD = "a" * 40
WORKFLOW = (
    "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
)


def _common() -> dict[str, object]:
    """Return one valid exact-identity receipt payload."""
    return {
        "schema_version": 1,
        "receipt_id": "concept35-cargo-1",
        "repository": "ContextualWisdomLab/ConceptWeave",
        "head_sha": HEAD,
        "workflow_ref": WORKFLOW,
        "run_id": 34073137064,
        "run_attempt": 1,
        "claim_sha256": sha256_text(CLAIM),
        "artifact_sha256": hashlib.sha256(ARTIFACT).hexdigest(),
        "artifact_size": len(ARTIFACT),
        "producer_version": "noema-claim-receipt-v1",
        "policy_version": "review-evidence-v1",
    }


def _execution() -> dict[str, object]:
    """Return one valid execution receipt payload."""
    return {
        **_common(),
        "evidence_kind": "execution",
        "argv": ["cargo", "generate-lockfile", "--locked"],
        "tool_identity": "cargo",
        "tool_version": "1.90.0",
        "exit_code": 1,
        "stdout_sha256": "c" * 64,
        "stderr_sha256": "d" * 64,
        "isolation_policy": "sandboxed-verify-v1",
        "network_policy": "disabled",
    }


def _admit(payload: object, **overrides: object):
    """Admit a payload with canonical caller-owned expectations."""
    values = {
        "claim": CLAIM,
        "artifact": ARTIFACT,
        "expected_repository": "ContextualWisdomLab/ConceptWeave",
        "expected_head_sha": HEAD,
        "expected_workflow_ref": WORKFLOW,
        "expected_run_id": 34073137064,
        "expected_run_attempt": 1,
        "required_kind": EvidenceKind.EXECUTION,
    }
    values.update(overrides)
    return admit_claim_evidence(payload, **values)


def test_exact_claim_execution_receipt_is_admitted() -> None:
    """A producer-bound exact claim and artifact are accepted."""
    receipt = _admit(_execution())
    assert isinstance(receipt, ExecutionClaimReceipt)
    assert receipt.receipt_id == "concept35-cargo-1"


@pytest.mark.parametrize(
    ("override", "value", "message"),
    [
        ("expected_repository", "ContextualWisdomLab/other", "identity"),
        ("expected_head_sha", "e" * 40, "identity"),
        (
            "expected_workflow_ref",
            "ContextualWisdomLab/noema/.github/workflows/ci.yml@" + "f" * 40,
            "identity",
        ),
        ("expected_run_id", 9, "identity"),
        ("expected_run_attempt", 2, "identity"),
        ("required_kind", EvidenceKind.RESEARCH, "kind"),
        ("claim", CLAIM + " altered", "claim digest"),
        ("artifact", ARTIFACT + b"x", "artifact size"),
    ],
)
def test_caller_owned_identity_claim_and_size_mismatches_fail_closed(
    override: str,
    value: object,
    message: str,
) -> None:
    """Model prose cannot alter caller-owned receipt admission inputs."""
    with pytest.raises(ValueError, match=message):
        _admit(_execution(), **{override: value})


def test_equal_size_artifact_substitution_fails_closed() -> None:
    """A same-length artifact still must match its sealed digest."""
    with pytest.raises(ValueError, match="artifact digest"):
        _admit(_execution(), artifact=b"x" * len(ARTIFACT))


def test_research_and_source_receipts_are_typed_not_model_relabelled() -> None:
    """Each producer class has a strict schema and cannot authorize another kind."""
    research = {
        **_common(),
        "evidence_kind": "research",
        "source_uri": "https://doc.rust-lang.org/cargo/commands/cargo-generate-lockfile.html",
        "source_revision": "sha256:" + "1" * 64,
        "excerpt_sha256": "2" * 64,
        "retrieval_policy": "originweave-pinned-v1",
    }
    source = {
        **_common(),
        "evidence_kind": "source",
        "source_path": ".github/workflows/ci.yml",
        "source_line": 42,
        "source_line_sha256": "3" * 64,
    }
    assert isinstance(
        _admit(research, required_kind=EvidenceKind.RESEARCH),
        ResearchClaimReceipt,
    )
    assert isinstance(
        _admit(source, required_kind=EvidenceKind.SOURCE),
        SourceClaimReceipt,
    )
    with pytest.raises(ValueError, match="kind mismatch"):
        _admit(source, required_kind=EvidenceKind.RESEARCH)


@pytest.mark.parametrize(
    "mutation",
    [
        {"claim_type": "research"},
        {"head_sha": "A" * 40},
        {"artifact_sha256": "not-a-digest"},
        {"run_attempt": 0},
    ],
)
def test_malformed_or_model_self_classified_receipts_fail_schema(
    mutation: dict[str, object],
) -> None:
    """Unknown authority and noncanonical identity are never ignored."""
    payload = {**_execution(), **mutation}
    with pytest.raises(ValidationError):
        _admit(payload)


def test_receipt_index_rejects_duplicate_ids() -> None:
    """One model citation cannot ambiguously select two producer receipts."""
    from noema_reviewer.claim_evidence import index_claim_evidence_receipts

    first = _execution()
    second = {**_execution(), "receipt_id": "concept35-cargo-2"}
    indexed = index_claim_evidence_receipts([first, second])
    assert set(indexed) == {"concept35-cargo-1", "concept35-cargo-2"}

    with pytest.raises(ValueError, match="duplicate"):
        index_claim_evidence_receipts([first, first])


def test_marker_only_sandbox_output_is_not_a_receipt() -> None:
    """A sandboxed result marker lacks the sealed manifest receipt schema."""
    with pytest.raises(ValidationError):
        _admit("SANDBOXED_VERIFY_RESULT status=passed")


def test_sha256_text_binds_exact_utf8_claim_bytes() -> None:
    """Claim wording changes produce a different exact digest."""
    assert sha256_text(CLAIM) != sha256_text(CLAIM.casefold())
