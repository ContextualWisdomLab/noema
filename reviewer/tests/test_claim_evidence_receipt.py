"""Focused tests for exact-claim receipt production and admission."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from noema_reviewer.claim_evidence import (
    EvidenceKind,
    ExecutionClaimReceipt,
    ResearchClaimReceipt,
    admit_claim_evidence,
    index_claim_evidence_receipts,
    produce_execution_claim_receipt,
    produce_research_claim_receipt,
    sha256_text,
)


CLAIM = (
    "--locked is not a valid invocation: --locked is not accepted by the "
    "generate-lockfile subcommand. This will always fail, breaking the workflow."
)
ARTIFACT = b'{"exit_code":2,"stderr":"unsupported"}\n'
HEAD = "a" * 40
WORKFLOW = "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
ISSUED = datetime(2026, 9, 7, tzinfo=timezone.utc)
EXPIRES = ISSUED + timedelta(hours=1)


def _common() -> dict[str, object]:
    return {
        "schema_version": 1,
        "receipt_id": "execution-1",
        "repository": "ContextualWisdomLab/ConceptWeave",
        "head_sha": HEAD,
        "workflow_ref": WORKFLOW,
        "run_id": 12,
        "run_attempt": 1,
        "claim_sha256": sha256_text(CLAIM),
        "artifact_sha256": hashlib.sha256(ARTIFACT).hexdigest(),
        "artifact_size": len(ARTIFACT),
        "producer_id": "sandboxed-verify",
        "producer_version": "v1",
        "policy_version": "review-evidence-v1",
        "issued_at": ISSUED,
        "expires_at": EXPIRES,
    }


def _execution() -> dict[str, object]:
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
    values = {
        "claim": CLAIM,
        "artifact": ARTIFACT,
        "expected_repository": "ContextualWisdomLab/ConceptWeave",
        "expected_head_sha": HEAD,
        "expected_workflow_ref": WORKFLOW,
        "expected_run_id": 12,
        "expected_run_attempt": 1,
        "expected_producer_id": "sandboxed-verify",
        "admitted_at": ISSUED + timedelta(minutes=1),
        "required_kind": EvidenceKind.EXECUTION,
    }
    values.update(overrides)
    return admit_claim_evidence(payload, **values)


def test_execution_producer_seals_exact_result_bytes() -> None:
    receipt = produce_execution_claim_receipt(
        receipt_id="execution-1", repository="ContextualWisdomLab/ConceptWeave",
        head_sha=HEAD, workflow_ref=WORKFLOW, run_id=12, run_attempt=1,
        claim=CLAIM, artifact=ARTIFACT, producer_id="sandboxed-verify",
        producer_version="v1", policy_version="review-evidence-v1",
        issued_at=ISSUED, expires_at=EXPIRES,
        argv=["cargo", "generate-lockfile", "--locked"], tool_identity="cargo",
        tool_version="1.90.0", exit_code=1, stdout=b"", stderr=b"unsupported\n",
        isolation_policy="sandboxed-verify-v1", network_policy="disabled",
    )
    assert isinstance(receipt, ExecutionClaimReceipt)
    assert receipt.claim_sha256 == sha256_text(CLAIM)
    assert receipt.artifact_sha256 == hashlib.sha256(ARTIFACT).hexdigest()
    assert receipt.stderr_sha256 == hashlib.sha256(b"unsupported\n").hexdigest()


def test_research_producer_content_addresses_retrieval_and_excerpt() -> None:
    excerpt = b"generate-lockfile accepts --offline"
    receipt = produce_research_claim_receipt(
        receipt_id="research-1", repository="ContextualWisdomLab/ConceptWeave",
        head_sha=HEAD, workflow_ref=WORKFLOW, run_id=12, run_attempt=1,
        claim=CLAIM, artifact=ARTIFACT, producer_id="pinned-research",
        producer_version="v1", policy_version="review-evidence-v1",
        issued_at=ISSUED, expires_at=EXPIRES,
        source_uri="https://doc.rust-lang.org/cargo/commands/cargo-generate-lockfile.html",
        excerpt=excerpt, retrieval_policy="originweave-pinned-v1",
    )
    assert isinstance(receipt, ResearchClaimReceipt)
    assert receipt.source_revision == "sha256:" + hashlib.sha256(ARTIFACT).hexdigest()
    assert receipt.excerpt_sha256 == hashlib.sha256(excerpt).hexdigest()


@pytest.mark.parametrize("when", [ISSUED - timedelta(seconds=1), EXPIRES])
def test_receipt_outside_bounded_validity_fails_closed(when: datetime) -> None:
    with pytest.raises(ValueError, match="not valid"):
        _admit(_execution(), admitted_at=when)


def test_wrong_or_missing_producer_fails_closed() -> None:
    with pytest.raises(ValueError, match="identity"):
        _admit(_execution(), expected_producer_id="other-producer")
    missing = _execution()
    del missing["producer_id"]
    with pytest.raises(ValidationError):
        _admit(missing)


def test_unbounded_or_ambiguous_validity_fails_schema() -> None:
    for mutation in (
        {"expires_at": ISSUED},
        {"issued_at": datetime(2026, 9, 7)},
        {"expires_at": datetime(2026, 9, 8)},
    ):
        with pytest.raises(ValidationError):
            _admit({**_execution(), **mutation})

    with pytest.raises(ValueError, match="timezone-aware"):
        _admit(_execution(), admitted_at=datetime(2026, 9, 7))


def test_model_supplied_artifact_path_has_no_admission_surface() -> None:
    with pytest.raises(ValidationError):
        _admit({**_execution(), "artifact_path": "/tmp/model-selected"})


def test_duplicate_receipt_ids_fail_closed() -> None:
    first = _execution()
    second = {**_execution(), "receipt_id": "execution-2"}
    assert set(index_claim_evidence_receipts([first, second])) == {"execution-1", "execution-2"}
    with pytest.raises(ValueError, match="duplicate"):
        index_claim_evidence_receipts([first, first])


def test_exact_admission_rejects_equal_size_substitution() -> None:
    assert isinstance(_admit(_execution()), ExecutionClaimReceipt)
    with pytest.raises(ValueError, match="kind mismatch"):
        _admit(_execution(), required_kind=EvidenceKind.RESEARCH)
    with pytest.raises(ValueError, match="claim digest"):
        _admit(_execution(), claim=CLAIM + " altered")
    with pytest.raises(ValueError, match="artifact size"):
        _admit(_execution(), artifact=ARTIFACT + b"x")
    with pytest.raises(ValueError, match="artifact digest"):
        _admit(_execution(), artifact=b"x" * len(ARTIFACT))


@pytest.mark.parametrize(
    ("override", "value"),
    [
        ("expected_repository", "ContextualWisdomLab/other"),
        ("expected_head_sha", "e" * 40),
        (
            "expected_workflow_ref",
            "ContextualWisdomLab/noema/.github/workflows/ci.yml@" + "f" * 40,
        ),
        ("expected_run_id", 9),
        ("expected_run_attempt", 2),
    ],
)
def test_each_caller_owned_execution_identity_mismatch_fails_closed(
    override: str,
    value: object,
) -> None:
    with pytest.raises(ValueError, match="identity"):
        _admit(_execution(), **{override: value})


def test_source_receipt_cannot_authorize_research() -> None:
    source = {
        **_common(),
        "evidence_kind": "source",
        "source_path": ".github/workflows/ci.yml",
        "source_line": 42,
        "source_line_sha256": "3" * 64,
    }
    with pytest.raises(ValueError, match="kind mismatch"):
        _admit(source, required_kind=EvidenceKind.RESEARCH)


@pytest.mark.parametrize(
    "mutation",
    [
        {"claim_type": "research"},
        {"head_sha": "A" * 40},
        {"artifact_sha256": "not-a-digest"},
        {"run_attempt": 0},
        {"argv": [""]},
    ],
)
def test_malformed_or_model_self_classified_receipts_fail_schema(
    mutation: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        _admit({**_execution(), **mutation})


def test_marker_only_sandbox_output_is_not_a_receipt() -> None:
    with pytest.raises(ValidationError):
        _admit("SANDBOXED_VERIFY_RESULT status=passed")


def test_sha256_text_binds_exact_utf8_claim_bytes() -> None:
    assert sha256_text(CLAIM) != sha256_text(CLAIM.casefold())
