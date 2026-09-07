"""Integration RED for trusted claim evidence at the real review boundary."""

from __future__ import annotations

import hashlib
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic_ai.models.test import TestModel

from noema_reviewer import cli
from noema_reviewer.agent import PydanticAIReviewAgent
from noema_reviewer.claim_evidence import (
    EvidenceKind,
    produce_claim_evidence_manifest,
    produce_execution_claim_receipt,
    verify_claim_evidence_manifest,
)
from noema_reviewer.claim_evidence_runtime import (
    MAX_SOURCE_CLAIM_CHARS,
    MAX_SOURCE_FILE_BYTES,
    MAX_SOURCE_RECEIPTS,
    admit_review_verdict_evidence,
    prompt_claim_evidence_references,
    produce_current_head_source_manifest,
    verify_claim_evidence_file,
)
from noema_reviewer import claim_evidence_runtime
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest
from noema_reviewer.models import Finding, ReviewVerdict, Severity, Verdict


CLAIM = (
    "--locked is not a valid invocation: --locked is not accepted by the "
    "generate-lockfile subcommand. This will always fail, breaking the workflow."
)
HEAD = "a" * 40
WORKFLOW = "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
ISSUED = datetime(2026, 9, 7, tzinfo=timezone.utc)
EXPIRES = ISSUED + timedelta(days=1)


def _review_manifest() -> ReviewManifest:
    """Return a complete bounded manifest for the actual review path."""
    return ReviewManifest(
        repo="ContextualWisdomLab/ConceptWeave",
        pr_number=35,
        head_sha=HEAD,
        diff="diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml",
        changed_files=[
            ChangedFile(
                path=".github/workflows/ci.yml",
                content="run: cargo generate-lockfile --locked\n",
            )
        ],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status="## codegraph explore\nci workflow command",
    )


def _execution_manifest(tmp_path: Path) -> tuple[Path, str]:
    """Write one canonical execution receipt manifest and return its digest."""
    produced = produce_execution_claim_receipt(
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
    manifest = produce_claim_evidence_manifest([(CLAIM, produced)])
    path = tmp_path / "claim-evidence.json"
    path.write_bytes(manifest)
    return path, hashlib.sha256(manifest).hexdigest()


def _args(manifest_path: Path, **extra: object):
    """Return parsed production CLI arguments."""
    argv = ["--manifest-file", str(manifest_path)]
    for key, value in extra.items():
        flag = "--" + key.replace("_", "-")
        if value is True:
            argv.append(flag)
        elif value is not False:
            argv.extend([flag, str(value)])
    return cli.parse_args(argv)


def _model_agent(evidence: str) -> PydanticAIReviewAgent:
    """Return the production driver around a deterministic offline model."""
    finding = Finding(
        severity=Severity.HIGH,
        path=".github/workflows/ci.yml",
        line=1,
        evidence=evidence,
        recommendation="Remove the unsupported flag.",
    )
    return PydanticAIReviewAgent(
        TestModel(
            custom_output_args=ReviewVerdict(
                verdict=Verdict.REQUEST_CHANGES,
                summary="The workflow command is invalid.",
                findings=[finding],
            ).model_dump(mode="json")
        )
    )


def test_trusted_manifest_reaches_agent_gate_before_publication(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A producer receipt is verified, shown to the model, admitted, then published."""
    review_manifest = _review_manifest()
    review_path = tmp_path / "review.json"
    review_path.write_text(review_manifest.model_dump_json(), encoding="utf-8")
    evidence_path, digest = _execution_manifest(tmp_path)
    published: list[ReviewVerdict] = []

    def factory(*, claim_evidence_index):
        agent = _model_agent(f"{CLAIM} [receipt:execution-1]")
        agent.bind_claim_evidence(claim_evidence_index, admitted_at=lambda: ISSUED)
        return agent

    monkeypatch.setattr(cli, "build_agent", factory)
    code = cli.run_review(
        _args(
            review_path,
            claim_evidence_manifest_file=evidence_path,
            claim_evidence_manifest_sha256=digest,
            claim_evidence_workflow_ref=WORKFLOW,
            claim_evidence_run_id=12,
            claim_evidence_run_attempt=1,
        ),
        publisher=lambda _repo, _pr, verdict, _head, _source: (
            published.append(verdict) or "REQUEST_CHANGES"
        ),
        out=io.StringIO(),
    )
    assert code == 2
    assert len(published) == 0

    cli.run_review(
        _args(
            review_path,
            publish=True,
            claim_evidence_manifest_file=evidence_path,
            claim_evidence_manifest_sha256=digest,
            claim_evidence_workflow_ref=WORKFLOW,
            claim_evidence_run_id=12,
            claim_evidence_run_attempt=1,
        ),
        publisher=lambda _repo, _pr, verdict, _head, _source: (
            published.append(verdict) or "REQUEST_CHANGES"
        ),
        out=io.StringIO(),
    )
    assert published and published[-1].findings[0].evidence.endswith(
        "[receipt:execution-1]"
    )


def test_free_text_model_evidence_never_reaches_publisher(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Free prose cannot become execution evidence without a verified receipt ID."""
    review_path = tmp_path / "review.json"
    review_path.write_text(_review_manifest().model_dump_json(), encoding="utf-8")
    evidence_path, digest = _execution_manifest(tmp_path)
    monkeypatch.setattr(
        cli,
        "build_agent",
        lambda *, claim_evidence_index: _model_agent(
            "Runtime behavior confirms the command is unsupported."
        ).bind_claim_evidence(claim_evidence_index, admitted_at=lambda: ISSUED),
    )
    with pytest.raises(ValueError, match="receipt"):
        cli.run_review(
            _args(
                review_path,
                publish=True,
                claim_evidence_manifest_file=evidence_path,
                claim_evidence_manifest_sha256=digest,
                claim_evidence_workflow_ref=WORKFLOW,
                claim_evidence_run_id=12,
                claim_evidence_run_attempt=1,
            ),
            publisher=lambda *_args: pytest.fail("unadmitted evidence must not publish"),
            out=io.StringIO(),
        )


def test_current_head_source_producer_populates_verified_prompt_receipts(
    tmp_path: Path,
) -> None:
    """The existing source producer fills the same manifest consumed by the agent."""
    source = tmp_path / ".github/workflows/ci.yml"
    source.parent.mkdir(parents=True)
    source.write_text("run: cargo generate-lockfile --locked\n", encoding="utf-8")
    manifest = produce_current_head_source_manifest(
        _review_manifest(),
        source_root=tmp_path,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        issued_at=ISSUED,
        expires_at=EXPIRES,
    )
    index = verify_claim_evidence_manifest(
        manifest,
        expected_manifest_sha256=hashlib.sha256(manifest).hexdigest(),
        expected_repository="ContextualWisdomLab/ConceptWeave",
        expected_head_sha=HEAD,
        expected_workflow_ref=WORKFLOW,
        expected_run_id=12,
        expected_run_attempt=1,
        expected_producers={"changed-source-map": EvidenceKind.SOURCE},
    )
    agent = _model_agent("run: cargo generate-lockfile --locked [receipt:missing]")
    agent.bind_claim_evidence(index, admitted_at=lambda: ISSUED)
    assert "[receipt:source-" in agent.prompt_for(_review_manifest())


def test_source_manifest_bounds_and_unsafe_paths_fail_closed(tmp_path: Path) -> None:
    """The source producer skips unsafe files and rejects unreviewed cardinality."""
    unsafe = _review_manifest().model_copy(
        update={
            "changed_files": [
                ChangedFile(path="", content=""),
                ChangedFile(path="/etc/passwd", content=""),
                ChangedFile(path="../escape", content=""),
                ChangedFile(path="missing", content=""),
            ]
        }
    )
    for limit in (0, MAX_SOURCE_RECEIPTS + 1):
        with pytest.raises(ValueError, match="limit"):
            produce_current_head_source_manifest(
                unsafe,
                source_root=tmp_path,
                workflow_ref=WORKFLOW,
                run_id=12,
                run_attempt=1,
                issued_at=ISSUED,
                expires_at=EXPIRES,
                max_receipts=limit,
            )

    manifest = produce_current_head_source_manifest(
        unsafe,
        source_root=tmp_path,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        issued_at=ISSUED,
        expires_at=EXPIRES,
    )
    assert b'"entries":[]' in manifest


def test_source_manifest_skips_unsafe_bytes_and_stops_at_bound(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only bounded printable UTF-8 source lines become producer receipts."""
    source = tmp_path / "source.txt"
    source.write_bytes(
        b"\n"
        + b"x" * (MAX_SOURCE_CLAIM_CHARS + 1)
        + b"\ninvalid-utf8:\xff\nnot-printable:\x00\nfirst\nsecond\n"
    )
    manifest_model = _review_manifest().model_copy(
        update={
            "changed_files": [
                ChangedFile(path="source.txt", content=""),
                ChangedFile(path="source.txt", content=""),
            ]
        }
    )
    bounded = produce_current_head_source_manifest(
        manifest_model,
        source_root=tmp_path,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        issued_at=ISSUED,
        expires_at=EXPIRES,
        max_receipts=1,
    )
    assert bounded.count(b'"receipt_id"') == 1

    original_read_bytes = Path.read_bytes

    def failed_read(path: Path) -> bytes:
        if path.name == "source.txt":
            raise OSError("read failed")
        return original_read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", failed_read)
    skipped = produce_current_head_source_manifest(
        manifest_model,
        source_root=tmp_path,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        issued_at=ISSUED,
        expires_at=EXPIRES,
    )
    assert b'"entries":[]' in skipped


def test_source_manifest_deduplicates_and_survives_resolution_race(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Duplicate paths emit once and a disappearing file is skipped safely."""
    source = tmp_path / "source.txt"
    source.write_text("one\n", encoding="utf-8")
    model = _review_manifest().model_copy(
        update={
            "changed_files": [
                ChangedFile(path="source.txt", content=""),
                ChangedFile(path="source.txt", content=""),
            ]
        }
    )
    deduplicated = produce_current_head_source_manifest(
        model,
        source_root=tmp_path,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        issued_at=ISSUED,
        expires_at=EXPIRES,
    )
    assert deduplicated.count(b'"receipt_id"') == 1

    original_resolve = Path.resolve

    def failed_candidate_resolve(path: Path, *, strict: bool = False) -> Path:
        if path.name == "source.txt":
            raise OSError("file disappeared")
        return original_resolve(path, strict=strict)

    monkeypatch.setattr(Path, "resolve", failed_candidate_resolve)
    skipped = produce_current_head_source_manifest(
        model,
        source_root=tmp_path,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        issued_at=ISSUED,
        expires_at=EXPIRES,
    )
    assert b'"entries":[]' in skipped


def test_source_manifest_rejects_symlink_and_oversized_file(tmp_path: Path) -> None:
    """Symlinks and oversized files never enter the trusted source manifest."""
    real = tmp_path / "real.txt"
    real.write_text("line\n", encoding="utf-8")
    linked = tmp_path / "linked.txt"
    linked.symlink_to(real)
    oversized = tmp_path / "large.txt"
    oversized.write_bytes(b"x" * (MAX_SOURCE_FILE_BYTES + 1))
    model = _review_manifest().model_copy(
        update={
            "changed_files": [
                ChangedFile(path="linked.txt", content=""),
                ChangedFile(path="large.txt", content=""),
            ]
        }
    )
    produced = produce_current_head_source_manifest(
        model,
        source_root=tmp_path,
        workflow_ref=WORKFLOW,
        run_id=12,
        run_attempt=1,
        issued_at=ISSUED,
        expires_at=EXPIRES,
    )
    assert b'"entries":[]' in produced


def test_runtime_admission_rejects_missing_index_and_receipt(tmp_path: Path) -> None:
    """No finding or unknown ID can borrow authority from free-form evidence."""
    empty = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    assert (
        admit_review_verdict_evidence(
            empty,
            trusted_index=None,
            admitted_at=ISSUED,
        )
        == ()
    )
    finding = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="blocked",
        findings=[
            Finding(
                severity=Severity.HIGH,
                path="x",
                evidence=f"{CLAIM} [receipt:missing]",
                recommendation="fix",
            )
        ],
    )
    with pytest.raises(ValueError, match="verified receipt"):
        admit_review_verdict_evidence(
            finding,
            trusted_index=None,
            admitted_at=ISSUED,
        )
    evidence_path, digest = _execution_manifest(tmp_path)
    index = verify_claim_evidence_file(
        evidence_path,
        expected_manifest_sha256=digest,
        expected_repository="ContextualWisdomLab/ConceptWeave",
        expected_head_sha=HEAD,
        expected_workflow_ref=WORKFLOW,
        expected_run_id=12,
        expected_run_attempt=1,
    )
    with pytest.raises(ValueError, match="missing from trusted manifest"):
        admit_review_verdict_evidence(
            finding,
            trusted_index=index,
            admitted_at=ISSUED,
        )
    assert prompt_claim_evidence_references(None) == []


def test_manifest_file_requires_regular_non_symlink(tmp_path: Path) -> None:
    """The workflow loader does not follow a model-controlled manifest alias."""
    missing = tmp_path / "missing.json"
    with pytest.raises(ValueError, match="regular file"):
        verify_claim_evidence_file(
            missing,
            expected_manifest_sha256="0" * 64,
            expected_repository="ContextualWisdomLab/ConceptWeave",
            expected_head_sha=HEAD,
            expected_workflow_ref=WORKFLOW,
            expected_run_id=12,
            expected_run_attempt=1,
        )
    target, _ = _execution_manifest(tmp_path)
    alias = tmp_path / "alias.json"
    alias.symlink_to(target)
    with pytest.raises(ValueError, match="regular file"):
        verify_claim_evidence_file(
            alias,
            expected_manifest_sha256="0" * 64,
            expected_repository="ContextualWisdomLab/ConceptWeave",
            expected_head_sha=HEAD,
            expected_workflow_ref=WORKFLOW,
            expected_run_id=12,
            expected_run_attempt=1,
        )
