"""Regression coverage for reviewer subprocess authority."""

from __future__ import annotations

import subprocess
from types import SimpleNamespace

import pytest

from noema_reviewer.github_io import default_codegraph_runner, default_runner


def test_default_runner_passes_only_reviewed_github_cli_environment(monkeypatch) -> None:
    """A hostile parent must not become ambient authority for the ``gh`` child."""
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        """Capture the subprocess contract without executing GitHub CLI."""
        observed.update(kwargs)
        return SimpleNamespace(returncode=0, stdout="ok", stderr="")

    monkeypatch.setenv("PATH", "/reviewed/bin")
    monkeypatch.setenv("GH_TOKEN", "delegated-github-token")
    monkeypatch.setenv("GITHUB_TOKEN", "ambient-github-token")
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "model-secret")
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "reviewer-secret")
    monkeypatch.setenv("NOEMA_REVIEWER_APP_PRIVATE_KEY", "app-private-key")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid")
    monkeypatch.setenv("HOME", "/hostile/home")
    monkeypatch.setenv("NODE_OPTIONS", "--require=/hostile/preload.cjs")
    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    assert default_runner(["gh", "api", "user"], None) == "ok"
    assert observed["env"] == {
        "PATH": "/reviewed/bin",
        "GH_TOKEN": "delegated-github-token",
        "GH_HOST": "github.com",
        "NO_COLOR": "1",
    }
    assert observed["shell"] is False
    assert isinstance(observed["timeout"], int)
    assert observed["timeout"] > 0


def test_default_runner_keeps_only_pinned_defaults_without_path_or_token(monkeypatch) -> None:
    """Missing optional launch/token authority must not widen the child environment."""
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        """Capture the subprocess contract without executing GitHub CLI."""
        observed.update(kwargs)
        return SimpleNamespace(returncode=0, stdout="ok", stderr="")

    monkeypatch.delenv("PATH", raising=False)
    monkeypatch.delenv("GH_TOKEN", raising=False)
    monkeypatch.setenv("GITHUB_TOKEN", "ambient-github-token")
    monkeypatch.setenv("HOME", "/hostile/home")
    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    assert default_runner(["gh", "api", "user"], None) == "ok"
    assert observed["env"] == {
        "GH_HOST": "github.com",
        "NO_COLOR": "1",
    }
    assert observed["shell"] is False


def test_default_runner_redacts_delegated_token_from_failure_diagnostics(monkeypatch) -> None:
    """A hostile ``gh`` failure cannot copy the delegated token into retained errors."""
    token = "delegated-github-token"

    def fake_run(args, **kwargs):
        """Echo the delegated credential as a hostile child executable might."""
        return SimpleNamespace(
            returncode=1,
            stdout="",
            stderr=f"authentication failed for {token}; retry token={token}",
        )

    monkeypatch.setenv("GH_TOKEN", token)
    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    with pytest.raises(RuntimeError) as raised:
        default_runner(["gh", "api", "user"], None)

    detail = str(raised.value)
    assert token not in detail
    assert "authentication failed" in detail
    assert "retry token=[REDACTED]" in detail


def test_default_runner_bounds_failure_diagnostics_after_redaction(monkeypatch) -> None:
    """A failed ``gh`` child cannot turn retained diagnostics into an unbounded channel."""
    token = "delegated-github-token"

    def fake_run(args, **kwargs):
        """Return an oversized error carrying delegated authority near the tail."""
        return SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="diagnostic:" + ("x" * 10_000) + token,
        )

    monkeypatch.setenv("GH_TOKEN", token)
    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    with pytest.raises(RuntimeError) as raised:
        default_runner(["gh", "api", "user"], None)

    detail = str(raised.value)
    assert token not in detail
    assert len(detail) < 2_000
    assert "truncated" in detail


def test_default_runner_fails_closed_on_timeout_without_echoing_child_output(monkeypatch) -> None:
    """A stalled hostile ``gh`` child is bounded without retaining token-bearing output."""
    token = "delegated-github-token"

    def fake_run(args, **kwargs):
        """Model a timed-out GitHub CLI child that echoed delegated authority."""
        raise subprocess.TimeoutExpired(
            cmd=args,
            timeout=kwargs.get("timeout", 0),
            output=f"stdout token={token}",
            stderr=f"stderr token={token}",
        )

    monkeypatch.setenv("GH_TOKEN", token)
    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    with pytest.raises(RuntimeError, match="timed out") as raised:
        default_runner(["gh", "api", "user"], None)

    assert token not in str(raised.value)


def test_default_codegraph_runner_is_bounded_and_fails_closed_on_timeout(
    monkeypatch,
    tmp_path,
) -> None:
    """Untrusted CodeGraph indexing cannot consume the whole workflow indefinitely."""
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        """Capture the bound and model a hung CodeGraph child."""
        observed.update(kwargs)
        raise subprocess.TimeoutExpired(cmd=args, timeout=kwargs.get("timeout", 0))

    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    with pytest.raises(RuntimeError, match="timed out"):
        default_codegraph_runner(["codegraph", "status"], str(tmp_path))

    assert isinstance(observed["timeout"], int)
    assert observed["timeout"] > 0


def test_default_codegraph_runner_bounds_failure_diagnostics(monkeypatch, tmp_path) -> None:
    """Target indexing cannot exfiltrate unbounded source text through retained stderr."""

    def fake_run(args, **kwargs):
        """Return an oversized target-controlled diagnostic."""
        return SimpleNamespace(returncode=1, stdout="", stderr="source:" + ("z" * 10_000))

    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    with pytest.raises(RuntimeError) as raised:
        default_codegraph_runner(["codegraph", "status"], str(tmp_path))

    detail = str(raised.value)
    assert len(detail) < 2_000
    assert "truncated" in detail
