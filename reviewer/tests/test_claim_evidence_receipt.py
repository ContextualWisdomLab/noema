"""Tests for authenticated exact-claim receipt production and admission."""

from __future__ import annotations

import hashlib
import json
from base64 import b64encode
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from noema_reviewer.claim_evidence import (
    ClaimEvidenceRequirement,
    ClaimPublicationAuthority,
    EvidenceKind,
    ExecutionClaimReceipt,
    ProducedClaimEvidence,
    ResearchClaimReceipt,
    SourceClaimReceipt,
    VerifiedClaimEvidenceIndex,
    admit_claim_evidence,
    index_claim_evidence_receipts,
    produce_claim_evidence_manifest,
    produce_execution_claim_receipt,
    produce_research_claim_receipt,
    sha256_text,
    verify_claim_evidence_manifest,
)


CLAIM = (
    "--locked is not a valid invocation: --locked is not accepted by the "
    "generate-lockfile subcommand. This will always fail, breaking the workflow."
)
HEAD = "a" * 40
WORKFLOW = "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
ISSUED = datetime(2026, 9, 7, tzinfo=timezone.utc)
EXPIRES = ISSUED + timedelta(hours=1)


def _requirement(
    claim: str,
    bundle: ProducedClaimEvidence,
    *,
    authority: ClaimPublicationAuthority = ClaimPublicationAuthority.FINDING,
) -> ClaimEvidenceRequirement:
    """Return caller-owned claim policy independent from one producer receipt."""
    return ClaimEvidenceRequirement(
        claim=claim,
        required_evidence_kind=bundle.receipt.evidence_kind,
        publication_authority=authority,
    )


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


def _producer_policy(bundle: ProducedClaimEvidence) -> dict[str, EvidenceKind]:
    """Return reviewed producer policy for one focused fixture."""
    return {bundle.receipt.producer_id: bundle.receipt.evidence_kind}


def _verify(
    bundle: ProducedClaimEvidence | None = None,
    *,
    manifest: bytes | None = None,
    **overrides: object,
) -> VerifiedClaimEvidenceIndex:
    """Verify one producer manifest against caller-owned exact identity."""
    selected = bundle or _execution_bundle()
    body = manifest or produce_claim_evidence_manifest(
        [(_requirement(CLAIM, selected), selected)]
    )
    values = {
        "manifest": body,
        "expected_manifest_sha256": hashlib.sha256(body).hexdigest(),
        "expected_repository": "ContextualWisdomLab/ConceptWeave",
        "expected_head_sha": HEAD,
        "expected_workflow_ref": WORKFLOW,
        "expected_run_id": 12,
        "expected_run_attempt": 1,
        "expected_producers": _producer_policy(selected),
    }
    values.update(overrides)
    return verify_claim_evidence_manifest(**values)


def _admit(
    bundle: ProducedClaimEvidence | None = None,
    **overrides: object,
) -> ExecutionClaimReceipt | ResearchClaimReceipt | SourceClaimReceipt:
    """Admit one model citation using only an authenticated manifest index."""
    selected = bundle or _execution_bundle()
    values = {
        "receipt_id": selected.receipt.receipt_id,
        "trusted_index": _verify(selected),
        "claim": CLAIM,
        "admitted_at": ISSUED + timedelta(minutes=1),
        "required_kind": selected.receipt.evidence_kind,
    }
    values.update(overrides)
    return admit_claim_evidence(**values)


def _manifest_with_receipt_mutation(
    bundle: ProducedClaimEvidence,
    mutation: dict[str, object],
) -> bytes:
    """Return canonical envelope bytes with only receipt fields substituted."""
    payload = json.loads(
        produce_claim_evidence_manifest([(_requirement(CLAIM, bundle), bundle)])
    )
    payload["entries"][0]["receipt"].update(mutation)
    return (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode()


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


def test_manifest_producer_and_verifier_create_immutable_id_index() -> None:
    """Only an exact authenticated envelope can create the admission index."""
    bundle = _execution_bundle()
    index = _verify(bundle)
    assert index.receipts[bundle.receipt.receipt_id] == bundle.receipt
    assert index.artifacts[bundle.receipt.receipt_id] == bundle.artifact
    assert index.claims[bundle.receipt.receipt_id] == CLAIM
    with pytest.raises(TypeError, match="verify_claim_evidence_manifest"):
        VerifiedClaimEvidenceIndex()
    with pytest.raises(TypeError):
        index.receipts["other"] = bundle.receipt  # type: ignore[index]
    with pytest.raises(TypeError):
        index.requirements["other"] = _requirement(  # type: ignore[index]
            CLAIM,
            bundle,
        )
    with pytest.raises(TypeError, match="authenticated claim policy"):
        produce_claim_evidence_manifest(  # type: ignore[list-item]
            [(CLAIM, bundle)]
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("argv", ["cargo", "other"]),
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
    manifest = _manifest_with_receipt_mutation(bundle, {field: value})
    with pytest.raises(ValueError, match="semantic artifact"):
        _verify(bundle, manifest=manifest)


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
    manifest = _manifest_with_receipt_mutation(bundle, {field: value})
    with pytest.raises(ValueError, match="semantic artifact"):
        _verify(bundle, manifest=manifest)


def test_model_dict_cannot_enter_index_or_admission() -> None:
    """The model cannot submit authoritative receipt or manifest dictionaries."""
    bundle = _execution_bundle()
    with pytest.raises(TypeError, match="receipt objects"):
        index_claim_evidence_receipts(  # type: ignore[list-item]
            [bundle.receipt.model_dump(mode="json")]
        )
    with pytest.raises(TypeError, match="verified manifest index"):
        admit_claim_evidence(  # type: ignore[arg-type]
            bundle.receipt.receipt_id,
            trusted_index={bundle.receipt.receipt_id: bundle.receipt},
            claim=CLAIM,
            admitted_at=ISSUED,
            required_kind=EvidenceKind.EXECUTION,
        )


def test_source_receipt_branch_is_bound_and_cannot_authorize_research() -> None:
    """Source semantics bind to their artifact and remain a distinct authority."""
    bundle = _source_bundle()
    assert isinstance(_admit(bundle), SourceClaimReceipt)
    manifest = _manifest_with_receipt_mutation(bundle, {"source_line": 43})
    with pytest.raises(ValueError, match="semantic artifact"):
        _verify(bundle, manifest=manifest)
    with pytest.raises(ValueError, match="kind mismatch"):
        _admit(bundle, required_kind=EvidenceKind.RESEARCH)


def test_missing_or_duplicate_trusted_receipt_fails_closed() -> None:
    """A citation must resolve uniquely in the authenticated manifest index."""
    bundle = _execution_bundle()
    with pytest.raises(ValueError, match="missing"):
        _admit(bundle, receipt_id="absent")
    with pytest.raises(ValueError, match="duplicate"):
        index_claim_evidence_receipts([bundle.receipt, bundle.receipt])
    with pytest.raises(ValueError, match="duplicate"):
        produce_claim_evidence_manifest(
            [
                (_requirement(CLAIM, bundle), bundle),
                (_requirement(CLAIM, bundle), bundle),
            ]
        )


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
        ("expected_producers", {"other": EvidenceKind.EXECUTION}, "producer policy"),
    ],
)
def test_caller_owned_manifest_identity_and_policy_fail_closed(
    override: str,
    value: object,
    message: str,
) -> None:
    """Manifest bytes cannot alter caller-owned workflow or producer policy."""
    with pytest.raises(ValueError, match=message):
        _verify(**{override: value})


def test_model_claim_mismatch_fails_closed_after_manifest_verification() -> None:
    """A receipt ID cannot authorize model text other than its exact claim."""
    with pytest.raises(ValueError, match="claim digest"):
        _admit(claim=CLAIM + " altered")


@pytest.mark.parametrize("when", [ISSUED - timedelta(seconds=1), EXPIRES])
def test_receipt_outside_bounded_validity_fails_closed(when: datetime) -> None:
    """Not-yet-issued and expired receipts cannot authorize a current review."""
    with pytest.raises(ValueError, match="not valid"):
        _admit(admitted_at=when)


def test_ambiguous_or_inverted_validity_fails_closed() -> None:
    """Producer, manifest, and admission timestamps require aware forward time."""
    with pytest.raises(ValueError, match="artifact timestamps"):
        produce_execution_claim_receipt(
            **{
                key: value
                for key, value in _execution_producer_arguments().items()
                if key != "issued_at"
            },
            issued_at=datetime(2026, 9, 7),
        )
    bundle = _execution_bundle()
    for mutation in (
        {"issued_at": "2026-09-07T00:00:00"},
        {"expires_at": "2026-09-08T00:00:00"},
        {"expires_at": "2026-09-07T00:00:00Z"},
    ):
        manifest = _manifest_with_receipt_mutation(bundle, mutation)
        with pytest.raises(ValidationError):
            _verify(bundle, manifest=manifest)
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
    """Manifest verification distinguishes truncation, substitution, and encoding."""
    bundle = _execution_bundle()
    assert _admit(bundle) == bundle.receipt
    for artifact, message in (
        (bundle.artifact + b"x", "artifact size"),
        (b"x" * len(bundle.artifact), "artifact digest"),
    ):
        altered = ProducedClaimEvidence(receipt=bundle.receipt, artifact=artifact)
        with pytest.raises(ValueError, match=message):
            _verify(altered)
    semantically_equal = json.dumps(json.loads(bundle.artifact), indent=2).encode()
    mutated_receipt = bundle.receipt.model_copy(
        update={
            "artifact_sha256": hashlib.sha256(semantically_equal).hexdigest(),
            "artifact_size": len(semantically_equal),
        }
    )
    altered = ProducedClaimEvidence(receipt=mutated_receipt, artifact=semantically_equal)
    with pytest.raises(ValueError, match="semantic artifact"):
        _verify(altered)


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
    """Unknown authority and noncanonical identity never enter a verified index."""
    bundle = _execution_bundle()
    manifest = _manifest_with_receipt_mutation(bundle, mutation)
    with pytest.raises(ValidationError):
        _verify(bundle, manifest=manifest)


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (b"SANDBOXED_VERIFY_RESULT status=passed", "valid JSON"),
        (b'{"schema_version":1,"entries":{}}\n', "shape"),
        (b'{"entries":[],"schema_version":3}\n', "shape"),
        (b'{"schema_version":1,"entries":[],"extra":1}\n', "shape"),
    ],
)
def test_marker_only_or_invalid_manifest_shape_fails_closed(
    payload: bytes,
    message: str,
) -> None:
    """A marker or malformed envelope cannot become a verified producer index."""
    with pytest.raises(ValueError, match=message):
        _verify(manifest=payload)


def test_manifest_digest_and_canonical_bytes_fail_closed() -> None:
    """The OpenCode handoff digest and one canonical serialization are required."""
    bundle = _execution_bundle()
    manifest = produce_claim_evidence_manifest(
        [(_requirement(CLAIM, bundle), bundle)]
    )
    with pytest.raises(ValueError, match="expected digest"):
        _verify(manifest=manifest, expected_manifest_sha256="INVALID")
    with pytest.raises(ValueError, match="digest mismatch"):
        _verify(manifest=manifest, expected_manifest_sha256="0" * 64)
    pretty = json.dumps(json.loads(manifest), indent=2).encode()
    with pytest.raises(ValueError, match="not canonical"):
        _verify(manifest=pretty)


def test_manifest_entry_shape_type_and_base64_fail_closed() -> None:
    """Manifest records require exact fields, text claims, and canonical base64."""
    bundle = _execution_bundle()
    base = json.loads(
        produce_claim_evidence_manifest([(_requirement(CLAIM, bundle), bundle)])
    )
    variants = []
    extra = json.loads(json.dumps(base))
    extra["entries"][0]["extra"] = 1
    variants.append((extra, "entry shape"))
    bad_claim = json.loads(json.dumps(base))
    bad_claim["entries"][0]["claim_requirement"]["claim"] = 1
    variants.append((bad_claim, "requirement"))
    bad_base64 = json.loads(json.dumps(base))
    bad_base64["entries"][0]["artifact_base64"] = "***"
    variants.append((bad_base64, "invalid base64"))
    bad_artifact_type = json.loads(json.dumps(base))
    bad_artifact_type["entries"][0]["artifact_base64"] = 1
    variants.append((bad_artifact_type, "entry type"))
    noncanonical_base64 = json.loads(json.dumps(base))
    encoded = b64encode(bundle.artifact).decode("ascii")
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    padding = len(encoded) - len(encoded.rstrip("="))
    final_index = len(encoded) - padding - 1
    low_bit_mask = 0b1111 if padding == 2 else 0b0011
    replacement = alphabet[alphabet.index(encoded[final_index]) ^ low_bit_mask]
    noncanonical_base64["entries"][0]["artifact_base64"] = (
        encoded[:final_index] + replacement + encoded[final_index + 1 :]
    )
    variants.append((noncanonical_base64, "not canonical"))
    for payload, message in variants:
        manifest = (
            json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n"
        ).encode()
        with pytest.raises(ValueError, match=message):
            _verify(bundle, manifest=manifest)


def test_manifest_claim_and_producer_contract_fail_closed() -> None:
    """Producer output cannot relabel its exact claim or evidence authority."""
    bundle = _execution_bundle()
    wrong_claim = CLAIM + " altered"
    with pytest.raises(ValueError, match="claim digest"):
        produce_claim_evidence_manifest(
            [(_requirement(wrong_claim, bundle), bundle)]
        )
    manifest = json.loads(
        produce_claim_evidence_manifest([(_requirement(CLAIM, bundle), bundle)])
    )
    manifest["entries"][0]["claim_requirement"]["claim"] = wrong_claim
    body = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    with pytest.raises(ValueError, match="claim digest"):
        _verify(bundle, manifest=body)


def test_manifest_requirement_kind_is_independent_from_receipt_kind() -> None:
    """Authenticated claim policy cannot borrow its required kind from a receipt."""
    bundle = _execution_bundle()
    wrong_requirement = ClaimEvidenceRequirement(
        claim=CLAIM,
        required_evidence_kind=EvidenceKind.SOURCE,
        publication_authority=ClaimPublicationAuthority.FINDING,
    )
    with pytest.raises(ValueError, match="requirement kind mismatch"):
        produce_claim_evidence_manifest([(wrong_requirement, bundle)])

    manifest = json.loads(
        produce_claim_evidence_manifest([(_requirement(CLAIM, bundle), bundle)])
    )
    manifest["entries"][0]["claim_requirement"][
        "required_evidence_kind"
    ] = EvidenceKind.SOURCE.value
    body = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    with pytest.raises(ValueError, match="requirement kind mismatch"):
        _verify(bundle, manifest=body)


def test_sha256_text_binds_exact_utf8_claim_bytes() -> None:
    """Claim wording changes produce a different exact digest."""
    assert sha256_text(CLAIM) != sha256_text(CLAIM.casefold())
