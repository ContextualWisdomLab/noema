"""The PydanticAI review driver behind the small ``ReviewAgent`` interface.

``noema`` owns the reviewer *agent* (this module); the ``noema`` Cloudflare
Worker owns only the GitHub-App token exchange, and the central ``.github``
workflow owns publication. Keeping the driver behind the ``ReviewAgent``
protocol means the sandbox plan's "Codex, OpenCode, PydanticAI, or another
driver" swap stays a one-line change, and tests drive it with an offline
``TestModel``/``FunctionModel`` — no network, no secret, no real model.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic_ai import Agent
from pydantic_ai.models import Model

from .config import ReviewerConfig, resolve_model
from .gating import apply_gates
from .manifest import ReviewManifest
from .models import ReviewVerdict


SYSTEM_PROMPT = (
    "You are Noema, an independent second reviewer for ContextualWisdomLab, "
    "separate from the OpenCode reviewer. You review a bounded manifest of a "
    "pull request: its diff, changed-file context, workflow logs, SARIF "
    "summary, dependency findings, prior review comments, and current check "
    "conclusions. Judge correctness, security, maintainability, and behavioral "
    "regressions from that evidence only. Approve when no blocking issue is "
    "supported by the evidence. Use request_changes only for concrete, "
    "evidence-backed blocking issues, and cite the log, SARIF, test, or source "
    "line for each finding. Use blocked when required evidence is missing rather "
    "than guessing. Never approve while an unresolved MEDIUM-or-higher "
    "dependency finding is present; require a package bump instead."
)


@runtime_checkable
class ReviewAgent(Protocol):
    """The minimal contract every review driver implements."""

    def review(self, manifest: ReviewManifest, *, strict: bool = False) -> ReviewVerdict:
        """Return a bounded verdict for the pull request described by ``manifest``."""
        ...


def _dependency_lines(manifest: ReviewManifest) -> list[str]:
    """Render dependency findings as compact prompt lines."""
    lines: list[str] = []
    for dependency in manifest.dependency_findings:
        state = "resolved" if dependency.resolved else "UNRESOLVED"
        lines.append(
            f"- [{dependency.severity.value}] {dependency.tool}: {dependency.package_name}"
            f"@{dependency.installed_version or '?'} -> {dependency.fixed_version or '?'} "
            f"{dependency.identifier} ({state})"
        )
    return lines


def build_prompt(manifest: ReviewManifest) -> str:
    """Build the bounded user prompt handed to the model for one review."""
    sections: list[str] = [
        f"Repository: {manifest.repo}",
        f"PR: #{manifest.pr_number}",
        f"Title: {manifest.title}",
        f"Head SHA: {manifest.head_sha}",
        f"CodeGraph status: {manifest.codegraph_status}",
        f"Diff truncated: {manifest.diff_truncated}",
    ]

    checks = [f"- {check.name}: {check.conclusion}" for check in manifest.check_conclusions]
    if checks:
        sections.append("Current check conclusions:\n" + "\n".join(checks))

    dependency_lines = _dependency_lines(manifest)
    if dependency_lines:
        sections.append("Dependency findings:\n" + "\n".join(dependency_lines))

    if manifest.sarif_summary.strip():
        sections.append("SARIF summary:\n" + manifest.sarif_summary)

    if manifest.workflow_logs.strip():
        sections.append("Workflow log excerpts:\n" + manifest.workflow_logs)

    comments = [
        f"- {comment.author} [{comment.state}] {comment.path}: {comment.body}"
        for comment in manifest.review_comments
    ]
    if comments:
        sections.append("Prior review comments:\n" + "\n".join(comments))

    files = [f"### {changed.path}\n{changed.content}" for changed in manifest.changed_files]
    if files:
        sections.append("Changed-file context:\n" + "\n\n".join(files))

    sections.append("Diff:\n" + (manifest.diff or "(no diff provided)"))
    return "\n\n".join(sections)


class PydanticAIReviewAgent:
    """A ``ReviewAgent`` backed by a PydanticAI ``Agent`` with a typed verdict."""

    def __init__(self, model: Model | str) -> None:
        """Build the agent around an injected model (a real model or a test model)."""
        self._agent: Agent[None, ReviewVerdict] = Agent(
            model,
            output_type=ReviewVerdict,
            system_prompt=SYSTEM_PROMPT,
            retries=3,
        )

    def review(self, manifest: ReviewManifest, *, strict: bool = False) -> ReviewVerdict:
        """Run the model over the manifest and apply the deterministic gates."""
        prompt = build_prompt(manifest)
        result = self._agent.run_sync(prompt)
        return apply_gates(manifest, result.output, strict=strict)


def build_agent(config: ReviewerConfig | None = None) -> PydanticAIReviewAgent:
    """Build a production review agent from resolved configuration.

    Configuration (model name, orchestrator base URL, API key) is resolved
    through :func:`resolve_model`, which follows the org KV-first rule and
    fails loudly when the model provider or credential is unavailable — the
    reviewer never degrades to a silent approval.
    """
    model = resolve_model(config)
    return PydanticAIReviewAgent(model)
