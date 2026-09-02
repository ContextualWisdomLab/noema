"""The PydanticAI review driver behind the small ``ReviewAgent`` interface.

``noema`` owns the reviewer agent; the Cloudflare Worker owns only GitHub-App
token exchange, and the central workflow owns publication. The driver receives
bounded evidence and never selects providers or allocates inference attempts.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic_ai import Agent, ModelSettings
from pydantic_ai.models import Model

from .config import ReviewerConfig, resolve_config, resolve_model
from .gating import apply_gates
from .manifest import ReviewManifest
from .models import ReviewVerdict


SYSTEM_PROMPT = (
    "You are Noema, an independent second reviewer for ContextualWisdomLab, "
    "separate from the OpenCode reviewer. You review a bounded manifest of a "
    "pull request: its diff, changed-file context, workflow logs, SARIF "
    "summary, dependency findings, prior review comments, and current check "
    "conclusions. Judge correctness, security, maintainability, and behavioral "
    "regressions from that evidence only. Approve only when no unresolved "
    "evidence-backed finding remains. Severity labels are descriptive metadata, "
    "not a local admission threshold. Use request_changes for concrete findings "
    "and cite the log, SARIF, test, or source line. Use blocked when required "
    "evidence is missing rather than guessing."
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


def model_settings_for_config(config: ReviewerConfig) -> ModelSettings | None:
    """Return request-level privacy settings derived from trusted workflow policy."""
    if not config.zdr_only:
        return None
    return ModelSettings(extra_body={"zdr_only": True})


class PydanticAIReviewAgent:
    """A ``ReviewAgent`` backed by a PydanticAI ``Agent`` with a typed verdict."""

    def __init__(
        self,
        model: Model | str,
        *,
        model_settings: ModelSettings | None = None,
    ) -> None:
        """Build the reviewer without allocating model retries inside Noema."""
        self._agent: Agent[None, ReviewVerdict] = Agent(
            model,
            output_type=ReviewVerdict,
            system_prompt=SYSTEM_PROMPT,
            model_settings=model_settings,
            retries=0,
        )

    def review(self, manifest: ReviewManifest, *, strict: bool = False) -> ReviewVerdict:
        """Run the model over the manifest and apply the deterministic gates."""
        prompt = build_prompt(manifest)
        result = self._agent.run_sync(prompt)
        return apply_gates(manifest, result.output, strict=strict)


def build_agent(config: ReviewerConfig | None = None) -> PydanticAIReviewAgent:
    """Build a production reviewer from one validated gateway configuration."""
    resolved = config or resolve_config()
    model = resolve_model(resolved)
    return PydanticAIReviewAgent(
        model,
        model_settings=model_settings_for_config(resolved),
    )
