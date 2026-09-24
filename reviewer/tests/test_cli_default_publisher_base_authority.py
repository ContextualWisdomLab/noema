"""Coverage for the production CLI publisher path and evaluated-base authority."""

from __future__ import annotations

import io

from noema_reviewer import cli
from noema_reviewer.manifest import ReviewManifest
from noema_reviewer.models import ReviewVerdict, Verdict


class FixedAgent:
    """Return a deterministic approval without invoking a model provider."""

    def review(self, manifest, *, strict: bool = False) -> ReviewVerdict:
        """Return the approval used to exercise publication orchestration."""
        del manifest, strict
        return ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")


def test_run_review_default_publisher_preserves_evaluated_base(monkeypatch) -> None:
    """The production publisher receives the exact head and evaluated base from the manifest."""
    head_sha = "a" * 40
    base_sha = "b" * 40
    manifest = ReviewManifest(
        repo="o/r",
        pr_number=9,
        head_sha=head_sha,
        base_sha=base_sha,
        diff="",
        changed_files=[],
        check_conclusions=[],
    )
    captured: dict[str, object] = {}

    def fake_publish(repo, pr_number, verdict, head, *, token_source, base_sha):
        captured.update(
            repo=repo,
            pr_number=pr_number,
            verdict=verdict,
            head=head,
            token_source=token_source,
            base_sha=base_sha,
        )
        return "APPROVE"

    monkeypatch.setattr(cli, "publish_verdict", fake_publish)
    args = cli.parse_args(["--repo", "o/r", "--pr-number", "9", "--publish"])
    code = cli.run_review(
        args,
        agent_factory=FixedAgent,
        manifest_loader=lambda args: manifest,
        out=io.StringIO(),
    )

    assert code == 0
    assert captured["head"] == head_sha
    assert captured["base_sha"] == base_sha
