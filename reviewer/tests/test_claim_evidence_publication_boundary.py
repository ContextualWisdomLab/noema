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
    produce_current_head_source_manifest,
)
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
