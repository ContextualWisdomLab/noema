"""Regression coverage for base-bound Noema publisher injection."""

from __future__ import annotations

import io

from noema_reviewer import cli
from noema_reviewer.manifest import ReviewManifest
from noema_reviewer.models import ReviewVerdict, Verdict


class _ApprovingAgent:
    """Return one deterministic approval without introducing model behavior."""

    def review(self, manifest: ReviewManifest, *, strict: bool = False) -> ReviewVerdict:
        """Return the fixed verdict; this test exercises only CLI publication wiring."""
        return ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")


def test_injected_publisher_receives_evaluated_base_sha() -> None:
    """The injectable publisher must receive the same evaluated base as production publication."""
    head_sha = "a" * 40
    base_sha = "b" * 40
    repo = "ContextualWisdomLab/noema"
    manifest = ReviewManifest(
        repo=repo,
        pr_number=730,
        base_sha=base_sha,
        head_sha=head_sha,
    )
    published: list[tuple[object, ...]] = []

    cli.run_review(
        cli.parse_args(["--repo", repo, "--pr-number", "730", "--publish"]),
        agent_factory=_ApprovingAgent,
        manifest_loader=lambda args: manifest,
        publisher=lambda *args: published.append(args) or "APPROVE",
        out=io.StringIO(),
    )

    assert len(published) == 1
    assert len(published[0]) == 6
    assert published[0][5] == base_sha
