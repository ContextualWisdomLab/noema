"""Regression coverage for CodeGraph subprocess ambient authority."""

from __future__ import annotations

from types import SimpleNamespace

from noema_reviewer.github_io import default_codegraph_runner


def test_default_codegraph_runner_rejects_ambient_process_authority(
    monkeypatch,
    tmp_path,
) -> None:
    """Untrusted CodeGraph indexing inherits only reviewed local execution state."""
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        """Capture the child process contract without executing CodeGraph."""
        observed.update(kwargs)
        return SimpleNamespace(returncode=0, stdout="ready", stderr="")

    monkeypatch.setenv("PATH", "/reviewed/bin")
    monkeypatch.setenv("HOME", "/reviewed/home")
    monkeypatch.setenv("TMPDIR", str(tmp_path))
    monkeypatch.setenv("LANG", "C.UTF-8")
    monkeypatch.setenv("NODE_OPTIONS", "--require=/hostile/preload.cjs")
    monkeypatch.setenv("GIT_ASKPASS", "/hostile/askpass")
    monkeypatch.setenv("SSH_AUTH_SOCK", "/hostile/agent.sock")
    monkeypatch.setenv("KUBECONFIG", "/hostile/kubeconfig")
    monkeypatch.setenv("DOCKER_CONFIG", "/hostile/docker")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid")
    monkeypatch.setenv("SAFE_REVIEW_LABEL", "must-not-propagate")
    monkeypatch.setattr("noema_reviewer.github_io.subprocess.run", fake_run)

    assert default_codegraph_runner(["codegraph", "status"], str(tmp_path)) == "ready"
    child_env = observed["env"]
    assert isinstance(child_env, dict)
    assert child_env["PATH"] == "/reviewed/bin"
    assert child_env["HOME"] == "/reviewed/home"
    assert child_env["TMPDIR"] == str(tmp_path)
    assert child_env["LANG"] == "C.UTF-8"
    assert child_env["NO_COLOR"] == "1"
    for name in (
        "NODE_OPTIONS",
        "GIT_ASKPASS",
        "SSH_AUTH_SOCK",
        "KUBECONFIG",
        "DOCKER_CONFIG",
        "HTTPS_PROXY",
        "SAFE_REVIEW_LABEL",
    ):
        assert name not in child_env
