"""Tests for trusted exact-claim receipt production and admission."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from noema_reviewer.claim_evidence import (
    EvidenceKind,
    ExecutionClaimReceipt,
    ProducedClaimEvidence,
    ResearchClaimReceipt,
    SourceClaimReceipt,
    admit_claim_evidence,
    index_claim_evidence_receipts,
    parse_trusted_claim_evidence_receipts,
    produce_execution_claim_receipt,
    produce_research_claim_receipt,
    sha256_text,
)


CLAIM = (
    "--locked is not a valid invocation: --locked is not accepted by the "
    "generate-lockfile subcommand. This will always fail, breaking the workflow."
)
HEAD = "a" * 40
WORKFLOW = "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
ISSUED = datetime(2026, 9, 7, tzinfo=timezone.utc)
EXPIRES = ISSUED + timedelta(hours=1)


def _execution_bundle() -> ProducedClaimEvidence:
    """Produce one canonical execution artifact and receipt."""
    return produce_execution_claim_receipt(
        receipt_id="execution-1",
        repository="ContextualWisdomLab/ConceptWeave",
        head_sha=HEAD,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        claim=CLAIM,
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


def _research_bundle() -> ProducedClaimEvidence:
    """Produce one content-addressed research artifact and receipt."""
    return produce_research_claim_receipt(
        receipt_id="research-1",
        repository="ContextualWisdomLab/ConceptWeave",
        head_sha=HEAD,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        claim=CLAIM,
        producer_id="pinned-research",
        producer_version="v1",
        policy_version="review-evidence-v1",
        issued_at=ISSUED,
        expires_at=EXPIRES,
        source_uri="https://doc.rust-lang.org/cargo/commands/cargo-generate-lockfile.html",
        retrieved_content=b"immutable documentation bytes\n",
        excerpt=b"generate-lockfile accepts --offline",
        retrieval_policy="originweave-pinned-v1",
    )


def _source_bundle() -> ProducedClaimEvidence:
    """Return a canonical source receipt fixture for the third union branch."""
    payload = {
        "schema_version": 1,
        "receipt_id": "source-1",
        "evidence_kind": "source",
        "repository": "ContextualWisdomLab/ConceptWeave",
        "head_sha": HEAD,
        "workflow_ref": WORKFLOW,
        "run_id": 12,
        "run_attempt": 1,
        "claim_sha256": sha256_text(CLAIM),
        "producer_id": "changed-source-map",
        "producer_version": "v1",
        "policy_version": "review-evidence-v1",
        "issued_at": "2026-09-07T00:00:00Z",
        "expires_at": "2026-09-07T01:00:00Z",
        "source_path": ".github/workflows/ci.yml",
        "source_line": 42,
        "source_line_sha256": "3" * 64,
    }
    artifact = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode()
    receipt = SourceClaimReceipt(
        **payload,
        artifact_sha256=hashlib.sha256(artifact).hexdigest(),
        artifact_size=len(artifact),
    )
    return ProducedClaimEvidence(receipt=receipt, artifact=artifact)


def _admit(
    bundle: ProducedClaimEvidence | None = None,
    **overrides: object,
) -> ExecutionClaimReceipt | ResearchClaimReceipt | SourceClaimReceipt:
    """Admit one model citation using only an out-of-band trusted index."""
    selected = bundle or _execution_bundle()
    values = {
        "receipt_id": selected.receipt.receipt_id,
        "trusted_receipts": index_claim_evidence_receipts([selected.receipt]),
        "claim": CLAIM,
        "artifact": selected.artifact,
        "expected_repository": "ContextualWisdomLab/ConceptWeave",
        "expected_head_sha": HEAD,
        "expected_workflow_ref": WORKFLOW,
        "expected_run_id": 12,
        "expected_run_attempt": 1,
        "expected_producer_id": selected.receipt.producer_id,
        "admitted_at": ISSUED + timedelta(minutes=1),
        "required_kind": selected.receipt.evidence_kind,
    }
    values.update(overrides)
    return admit_claim_evidence(**values)


def test_execution_producer_seals_every_semantic_field() -> None:
    """Canonical execution artifacts cover identity, command, result, and policy."""
    bundle = _execution_bundle()
    payload = json.loads(bundle.artifact)
    assert isinstance(bundle.receipt, ExecutionClaimReceipt)
    assert payload["claim_sha256"] == sha256_text(CLAIM)
    assert payload["argv"] == ["cargo", "generate-lockfile", "--locked"]
    assert payload["exit_code"] == 1
    assert payload["stderr_sha256"] == hashlib.sha256(b"unsupported\n").hexdigest()
    assert bundle.receipt.artifact_sha256 == hashlib.sha256(bundle.artifact).hexdigest()


def test_research_producer_content_addresses_retrieval_and_excerpt() -> None:
    """Research semantics bind fetched content and the bounded cited excerpt."""
    bundle = _research_bundle()
    payload = json.loads(bundle.artifact)
    assert isinstance(bundle.receipt, ResearchClaimReceipt)
    assert bundle.receipt.source_revision == "sha256:" + hashlib.sha256(
        b"immutable documentation bytes\n"
    ).hexdigest()
    assert payload["excerpt_sha256"] == hashlib.sha256(
        b"generate-lockfile accepts --offline"
    ).hexdigest()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("argv", ("cargo", "other")),
        ("tool_identity", "not-cargo"),
        ("tool_version", "other"),
        ("exit_code", 0),
        ("stdout_sha256", "1" * 64),
        ("stderr_sha256", "2" * 64),
        ("isolation_policy", "other"),
        ("network_policy", "enabled"),
    ],
)
def test_execution_semantic_field_substitution_fails_closed(
    field: str,
    value: object,
) -> None:
    """A fixed artifact cannot authorize substituted execution semantics."""
    bundle = _execution_bundle()
    mutated = bundle.receipt.model_copy(update={field: value})
    with pytest.raises(ValueError, match="semantic artifact"):
        _admit(bundle, trusted_receipts={mutated.receipt_id: mutated})


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("source_uri", "https://example.invalid/other"),
        ("source_revision", "sha256:" + "1" * 64),
        ("excerpt_sha256", "2" * 64),
        ("retrieval_policy", "other"),
    ],
)
def test_research_semantic_field_substitution_fails_closed(
    field: str,
    value: object,
) -> None:
    """A fixed artifact cannot authorize substituted research semantics."""
    bundle = _research_bundle()
    mutated = bundle.receipt.model_copy(update={field: value})
    with pytest.raises(ValueError, match="semantic artifact"):
        _admit(bundle, trusted_receipts={mutated.receipt_id: mutated})


def test_model_can_cite_id_but_cannot_submit_authoritative_receipt_dict() -> None:
    """Only typed objects parsed after manifest authentication enter the index."""
    bundle = _execution_bundle()
    payload = bundle.receipt.model_dump(mode="json")
    with pytest.raises(TypeError, match="receipt objects"):
        index_claim_evidence_receipts([payload])  # type: ignore[list-item]
    trusted = parse_trusted_claim_evidence_receipts([payload])
    assert _admit(bundle, trusted_receipts=index_claim_evidence_receipts(trusted)) == bundle.receipt


def test_source_receipt_branch_is_bound_and_cannot_authorize_research() -> None:
    """Source semantics bind to their artifact and remain a distinct authority."""
    bundle = _source_bundle()
    assert isinstance(_admit(bundle), SourceClaimReceipt)
    mutated = bundle.receipt.model_copy(update={"source_line": 43})
    with pytest.raises(ValueError, match="semantic artifact"):
        _admit(bundle, trusted_receipts={mutated.receipt_id: mutated})
    with pytest.raises(ValueError, match="kind mismatch"):
        _admit(bundle, required_kind=EvidenceKind.RESEARCH)


def test_missing_or_duplicate_trusted_receipt_fails_closed() -> None:
    """A citation must resolve uniquely in the authenticated manifest index."""
    bundle = _execution_bundle()
    with pytest.raises(ValueError, match="missing"):
        _admit(bundle, receipt_id="absent")
    with pytest.raises(ValueError, match="duplicate"):
        index_claim_evidence_receipts([bundle.receipt, bundle.receipt])


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
        ("expected_producer_id", "other", "identity"),
        ("claim", CLAIM + " altered", "claim digest"),
    ],
)
def test_caller_owned_identity_and_claim_mismatch_fails_closed(
    override: str,
    value: object,
    message: str,
) -> None:
    """Model prose cannot alter any caller-owned admission identity."""
    with pytest.raises(ValueError, match=message):
        _admit(**{override: value})


@pytest.mark.parametrize("when", [ISSUED - timedelta(seconds=1), EXPIRES])
def test_receipt_outside_bounded_validity_fails_closed(when: datetime) -> None:
    """Not-yet-issued and expired receipts cannot authorize a current review."""
    with pytest.raises(ValueError, match="not valid"):
        _admit(admitted_at=when)


def test_ambiguous_or_inverted_validity_fails_closed() -> None:
    """Producer and model timestamps require timezone-aware forward intervals."""
    with pytest.raises(ValueError, match="artifact timestamps"):
        produce_execution_claim_receipt(
            **{
                key: value
                for key, value in _execution_producer_arguments().items()
                if key != "issued_at"
            },
            issued_at=datetime(2026, 9, 7),
        )
    payload = _execution_bundle().receipt.model_dump(mode="json")
    for mutation in (
        {"issued_at": datetime(2026, 9, 7)},
        {"expires_at": datetime(2026, 9, 8)},
        {"expires_at": ISSUED},
    ):
        with pytest.raises(ValidationError):
            parse_trusted_claim_evidence_receipts([{**payload, **mutation}])
    with pytest.raises(ValueError, match="admission time"):
        _admit(admitted_at=datetime(2026, 9, 7))


def _execution_producer_arguments() -> dict[str, object]:
    """Expose canonical producer inputs for one timestamp failure case."""
    return {
        "receipt_id": "execution-1",
        "repository": "ContextualWisdomLab/ConceptWeave",
        "head_sha": HEAD,
        "workflow_ref": WORKFLOW,
        "run_id": 12,
        "run_attempt": 1,
        "claim": CLAIM,
        "producer_id": "sandboxed-verify",
        "producer_version": "v1",
        "policy_version": "review-evidence-v1",
        "issued_at": ISSUED,
        "expires_at": EXPIRES,
        "argv": ["cargo"],
        "tool_identity": "cargo",
        "tool_version": "1.90.0",
        "exit_code": 1,
        "stdout": b"",
        "stderr": b"unsupported\n",
        "isolation_policy": "sandboxed-verify-v1",
        "network_policy": "disabled",
    }


def test_artifact_size_digest_and_semantic_bytes_each_fail_closed() -> None:
    """Artifact admission distinguishes truncation, substitution, and encoding."""
    bundle = _execution_bundle()
    assert _admit(bundle) == bundle.receipt
    with pytest.raises(ValueError, match="artifact size"):
        _admit(bundle, artifact=bundle.artifact + b"x")
    with pytest.raises(ValueError, match="artifact digest"):
        _admit(bundle, artifact=b"x" * len(bundle.artifact))
    semantically_equal = json.dumps(json.loads(bundle.artifact), indent=2).encode()
    mutated = bundle.receipt.model_copy(
        update={
            "artifact_sha256": hashlib.sha256(semantically_equal).hexdigest(),
            "artifact_size": len(semantically_equal),
        }
    )
    with pytest.raises(ValueError, match="semantic artifact"):
        _admit(
            bundle,
            artifact=semantically_equal,
            trusted_receipts={mutated.receipt_id: mutated},
        )


@pytest.mark.parametrize(
    "mutation",
    [
        {"claim_type": "research"},
        {"head_sha": "A" * 40},
        {"artifact_sha256": "not-a-digest"},
        {"run_attempt": 0},
        {"argv": [""]},
        {"artifact_path": "/tmp/model-selected"},
    ],
)
def test_malformed_or_model_authored_authority_fails_schema(
    mutation: dict[str, object],
) -> None:
    """Unknown authority and noncanonical identity never enter a trusted index."""
    payload = _execution_bundle().receipt.model_dump(mode="json")
    with pytest.raises(ValidationError):
        parse_trusted_claim_evidence_receipts([{**payload, **mutation}])


def test_marker_only_sandbox_output_is_not_a_receipt() -> None:
    """A result marker is not an authenticated producer manifest payload."""
    with pytest.raises(ValidationError):
        parse_trusted_claim_evidence_receipts(
            ["SANDBOXED_VERIFY_RESULT status=passed"]
        )


def test_sha256_text_binds_exact_utf8_claim_bytes() -> None:
    """Claim wording changes produce a different exact digest."""
    assert sha256_text(CLAIM) != sha256_text(CLAIM.casefold())
