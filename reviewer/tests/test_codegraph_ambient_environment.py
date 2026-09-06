"""Regression coverage for CodeGraph subprocess ambient authority."""

from __future__ import annotations

import os
from types import SimpleNamespace

from noema_reviewer.github_io import default_codegraph_runner


def test_default_codegraph_runner_rejects_ambient_process_authority(
    monkeypatch,
    tmp_path,
) -> None:
    """Untrusted CodeGraph inherits only reviewed discovery/locale process state."""
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        """Capture the child process contract without executing CodeGraph."""
        observed.update(kwargs)
        child_env = kwargs["env"]
        observed["isolated_home_exists"] = os.path.isdir(child_env["HOME"])
        return SimpleNamespace(returncode=0, stdout="ready", stderr="")

    ambient_tmpdir = tmp_path / "ambient-tmpdir"
    ambient_tmp = tmp_path / "ambient-tmp"
    ambient_temp = tmp_path / "ambient-temp"
    monkeypatch.setenv("PATH", "/reviewed/bin")
    monkeypatch.setenv("HOME", "/host-user/home")
    monkeypatch.setenv("TMPDIR", str(ambient_tmpdir))
    monkeypatch.setenv("TMP", str(ambient_tmp))
    monkeypatch.setenv("TEMP", str(ambient_temp))
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
    assert child_env["HOME"] != "/host-user/home"
    assert observed["isolated_home_exists"] is True
    assert child_env["TMPDIR"] == child_env["HOME"]
    assert child_env["TMP"] == child_env["HOME"]
    assert child_env["TEMP"] == child_env["HOME"]
    assert child_env["TMPDIR"] != str(ambient_tmpdir)
    assert child_env["TMP"] != str(ambient_tmp)
    assert child_env["TEMP"] != str(ambient_temp)
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
