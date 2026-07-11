"""Tests for the reviewer CLI orchestration."""

from __future__ import annotations

import io
import json

import pytest

from noema_reviewer import cli
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest
from noema_reviewer.models import ReviewVerdict, Verdict


class FixedAgent:
    """A ReviewAgent stub returning a preset verdict and recording strictness."""

    def __init__(self, verdict: ReviewVerdict) -> None:
        """Store the verdict to return."""
        self.verdict = verdict
        self.saw_strict: bool | None = None

    def review(self, manifest, *, strict: bool = False) -> ReviewVerdict:
        """Return the preset verdict and record the strict flag."""
        self.saw_strict = strict
        return self.verdict


def _manifest() -> ReviewManifest:
    """Build a minimal manifest for CLI tests."""
    return ReviewManifest(
        repo="o/r",
        pr_number=9,
        head_sha="h",
        diff="d",
        changed_files=[ChangedFile(path="a", content="x")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
    )


def _args(**overrides):
    """Parse CLI args with test-friendly defaults."""
    argv = ["--repo", "o/r", "--pr-number", "9"]
    for key, value in overrides.items():
        flag = "--" + key.replace("_", "-")
        if value is True:
            argv.append(flag)
        elif value is not False:
            argv.extend([flag, str(value)])
    return cli.parse_args(argv)


def test_run_review_approve_returns_zero_and_writes_json() -> None:
    """An approval writes verdict JSON to stdout and exits 0."""
    out = io.StringIO()
    agent = FixedAgent(ReviewVerdict(verdict=Verdict.APPROVE, summary="ok"))
    code = cli.run_review(
        _args(),
        agent_factory=lambda: agent,
        manifest_loader=lambda args: _manifest(),
        publisher=lambda *a: "APPROVE",
        out=out,
    )
    assert code == 0
    assert json.loads(out.getvalue())["verdict"] == "approve"


def test_run_review_request_changes_returns_two() -> None:
    """A request_changes verdict exits 2 so callers can branch on judgement."""
    agent = FixedAgent(ReviewVerdict(verdict=Verdict.REQUEST_CHANGES, summary="no"))
    code = cli.run_review(
        _args(strict=True),
        agent_factory=lambda: agent,
        manifest_loader=lambda args: _manifest(),
        publisher=lambda *a: "REQUEST_CHANGES",
        out=io.StringIO(),
    )
    assert code == 2
    assert agent.saw_strict is True


def test_run_review_publishes_when_requested() -> None:
    """--publish invokes the publisher and reports the event."""
    published: list[tuple] = []
    out = io.StringIO()
    cli.run_review(
        _args(publish=True),
        agent_factory=lambda: FixedAgent(ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")),
        manifest_loader=lambda args: _manifest(),
        publisher=lambda *a: published.append(a) or "APPROVE",
        out=out,
    )
    assert published
    assert "Published Noema APPROVE review" in out.getvalue()


def test_run_review_writes_output_file(tmp_path) -> None:
    """--output writes the verdict JSON to a file instead of stdout."""
    output = tmp_path / "verdict.json"
    cli.run_review(
        _args(output=str(output)),
        agent_factory=lambda: FixedAgent(ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")),
        manifest_loader=lambda args: _manifest(),
        publisher=lambda *a: "APPROVE",
        out=io.StringIO(),
    )
    assert json.loads(output.read_text())["verdict"] == "approve"


def test_load_manifest_from_file(tmp_path) -> None:
    """The default loader reads a manifest JSON file when provided."""
    manifest_file = tmp_path / "m.json"
    manifest_file.write_text(_manifest().model_dump_json())
    args = _args(manifest_file=str(manifest_file))
    loaded = cli._load_manifest(args)
    assert loaded.repo == "o/r"


def test_load_manifest_fetches_when_no_file(monkeypatch) -> None:
    """The default loader fetches from GitHub when no file is given."""
    monkeypatch.setattr(cli, "fetch_manifest", lambda repo, pr_number: _manifest())
    assert cli._load_manifest(_args()).pr_number == 9


def test_publish_adapter_calls_github(monkeypatch) -> None:
    """The default publisher adapter forwards to github_io.publish_verdict."""
    captured = {}

    def fake_publish(repo, pr_number, verdict, head_sha, *, token_source):
        captured["repo"] = repo
        captured["token_source"] = token_source
        return "APPROVE"

    monkeypatch.setattr(cli, "publish_verdict", fake_publish)
    event = cli._publish("o/r", 9, ReviewVerdict(verdict=Verdict.APPROVE, summary="ok"), "h", "SRC")
    assert event == "APPROVE"
    assert captured["token_source"] == "SRC"


def test_main_requires_repo_without_manifest() -> None:
    """main rejects invocations missing both repo/pr and a manifest file."""
    with pytest.raises(SystemExit):
        cli.main(["--repo", "", "--pr-number", "0"])


def test_main_runs_with_manifest_file(tmp_path, monkeypatch) -> None:
    """main runs end to end when a manifest file bypasses GitHub and the agent is stubbed."""
    manifest_file = tmp_path / "m.json"
    manifest_file.write_text(_manifest().model_dump_json())
    monkeypatch.setattr(cli, "build_agent", lambda: FixedAgent(ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")))
    code = cli.main(["--manifest-file", str(manifest_file)])
    assert code == 0
