"""Tests for the PydanticAI review driver, driven by an offline TestModel."""

from __future__ import annotations

from pydantic_ai.models.test import TestModel

from noema_reviewer.agent import (
    PydanticAIReviewAgent,
    ReviewAgent,
    build_agent,
    build_prompt,
)
from noema_reviewer.manifest import (
    ChangedFile,
    CheckConclusion,
    DependencyFinding,
    ReviewComment,
    ReviewManifest,
)
from noema_reviewer.models import Severity, Verdict


def _agent_returning(**output_args) -> PydanticAIReviewAgent:
    """Build a review agent whose model returns a fixed verdict."""
    defaults = {"verdict": "approve", "summary": "no blocking issue", "findings": [], "confidence": "high"}
    defaults.update(output_args)
    return PydanticAIReviewAgent(TestModel(custom_output_args=defaults))


def _evidenced_manifest(**overrides) -> ReviewManifest:
    """Build a manifest that satisfies the strict evidence gate."""
    base = dict(
        repo="o/r",
        pr_number=7,
        diff="diff --git a/x b/x",
        changed_files=[ChangedFile(path="x", content="print(1)")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
    )
    base.update(overrides)
    return ReviewManifest(**base)


def test_agent_satisfies_protocol() -> None:
    """The concrete driver satisfies the runtime-checkable ReviewAgent protocol."""
    assert isinstance(_agent_returning(), ReviewAgent)


def test_agent_returns_model_approval() -> None:
    """A model approval flows through unchanged when no gate fires."""
    verdict = _agent_returning().review(_evidenced_manifest())
    assert verdict.verdict is Verdict.APPROVE
    assert verdict.summary == "no blocking issue"


def test_agent_dependency_gate_overrides_model_approval() -> None:
    """An unresolved HIGH finding downgrades the model's approval."""
    manifest = _evidenced_manifest(
        dependency_findings=[
            DependencyFinding(tool="trivy", package_name="pkg", severity=Severity.HIGH, fixed_version="2.0")
        ]
    )
    verdict = _agent_returning().review(manifest)
    assert verdict.verdict is Verdict.REQUEST_CHANGES


def test_agent_strict_blocks_without_evidence() -> None:
    """Strict mode blocks before trusting the model when evidence is missing."""
    verdict = _agent_returning().review(ReviewManifest(repo="o/r", pr_number=1), strict=True)
    assert verdict.verdict is Verdict.BLOCKED


def test_build_prompt_includes_all_sections() -> None:
    """The prompt renders every populated manifest section."""
    manifest = _evidenced_manifest(
        title="Add feature",
        head_sha="abc",
        sarif_summary="1 HIGH in x",
        workflow_logs="pytest failed",
        dependency_findings=[DependencyFinding(tool="osv", package_name="p", severity=Severity.MEDIUM)],
        review_comments=[ReviewComment(author="bob", path="x", body="nit")],
    )
    prompt = build_prompt(manifest)
    assert "Repository: o/r" in prompt
    assert "Current check conclusions:" in prompt
    assert "Dependency findings:" in prompt
    assert "SARIF summary:" in prompt
    assert "Workflow log excerpts:" in prompt
    assert "Prior review comments:" in prompt
    assert "Changed-file context:" in prompt


def test_build_prompt_handles_empty_diff() -> None:
    """A manifest with no diff renders the explicit no-diff placeholder."""
    prompt = build_prompt(ReviewManifest(repo="o/r", pr_number=1))
    assert "(no diff provided)" in prompt


def test_build_agent_uses_resolved_model(monkeypatch) -> None:
    """build_agent constructs the driver from the resolved model."""
    monkeypatch.setattr("noema_reviewer.agent.resolve_model", lambda config=None: TestModel())
    agent = build_agent()
    assert isinstance(agent, PydanticAIReviewAgent)
