"""Regressions for raw Git-tree snapshots and a single bounded result file."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    PatchValidationResult,
    PatchValidationStatus,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)


def _run_git(source: Path, *arguments: str) -> str:
    """Run one bounded non-shell Git command in a temporary repository."""
    completed = subprocess.run(
        [patch_validation.TRUSTED_GIT_EXECUTABLE, "-C", str(source), *arguments],
        check=True,
        shell=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    return completed.stdout.strip()


def _repository(tmp_path: Path) -> Path:
    """Create one committed test repository with deterministic identity."""
    source = tmp_path / "source"
    source.mkdir()
    _run_git(source, "init", "-q")
    _run_git(source, "config", "user.name", "Noema Test")
    _run_git(source, "config", "user.email", "noema-test@example.invalid")
    return source


def _commit(source: Path, message: str = "fixture") -> str:
    """Commit every fixture path and return the exact head SHA."""
    _run_git(source, "add", "--all")
    _run_git(source, "commit", "-qm", message)
    return _run_git(source, "rev-parse", "HEAD")


def _materialize(source: Path, head_sha: str, tmp_path: Path) -> Path:
    """Materialize one exact committed source snapshot through production code."""
    staging = tmp_path / "staging"
    staging.mkdir()
    return patch_validation._materialize_committed_source(
        source,
        head_sha,
        staging,
        "directory",
    )


def _patch() -> bytes:
    """Return one ordinary bounded patch for Docker-boundary testing."""
    return (
        "diff --git a/src/example.ts b/src/example.ts\n"
        "--- a/src/example.ts\n"
        "+++ b/src/example.ts\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
    ).encode()


def _request(patch_bytes: bytes) -> PatchValidationRequest:
    """Build an exact request for one non-Git authenticated source snapshot."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha="2" * 40,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _result_json(request: PatchValidationRequest) -> str:
    """Return exact-request-bound successful structured evidence."""
    return PatchValidationResult(
        status=PatchValidationStatus.PASSED,
        repository_full_name=request.repository_full_name,
        base_sha=request.base_sha,
        head_sha=request.head_sha,
        patch_sha256=request.patch_sha256,
        profile=request.profile,
        command_profile="npm run release:verify",
        exit_code=0,
        duration_ms=1,
        stdout_excerpt="passed",
        stderr_excerpt="",
        reason_codes=[],
    ).model_dump_json()


def _mount_source(command: list[str], destination: str) -> Path:
    """Return the host source path for one exact Docker bind destination."""
    suffix = f",dst={destination}"
    mount = next(
        argument
        for argument in command
        if argument.startswith("--mount=") and suffix in argument
    )
    return Path(mount.split("src=", 1)[1].split(",dst=", 1)[0])


def _mount_destinations(command: list[str]) -> tuple[str, ...]:
    """Return exact Docker bind destinations without prefix collisions."""
    return tuple(
        argument.split(",dst=", 1)[1].split(",", 1)[0]
        for argument in command
        if argument.startswith("--mount=") and ",dst=" in argument
    )


def test_exact_snapshot_ignores_committed_export_ignore(
    tmp_path: Path,
) -> None:
    """A committed export-ignore rule cannot hide a tracked failing test."""
    source = _repository(tmp_path)
    hidden = source / "tests" / "failing_test.py"
    hidden.parent.mkdir()
    hidden.write_text("raise AssertionError('must remain visible')\n", encoding="utf-8")
    (source / ".gitattributes").write_text(
        "tests/failing_test.py export-ignore\n",
        encoding="utf-8",
    )
    head_sha = _commit(source)

    snapshot = _materialize(source, head_sha, tmp_path)

    assert (snapshot / "tests" / "failing_test.py").read_bytes() == hidden.read_bytes()


def test_exact_snapshot_ignores_committed_export_subst(
    tmp_path: Path,
) -> None:
    """A committed export-subst rule cannot rewrite raw tracked blob bytes."""
    source = _repository(tmp_path)
    version = source / "src" / "version.txt"
    version.parent.mkdir()
    version.write_text("$Format:%H$\n", encoding="utf-8")
    (source / ".gitattributes").write_text(
        "src/version.txt export-subst\n",
        encoding="utf-8",
    )
    head_sha = _commit(source)

    snapshot = _materialize(source, head_sha, tmp_path)

    assert (snapshot / "src" / "version.txt").read_bytes() == b"$Format:%H$\n"


def test_exact_snapshot_ignores_untracked_git_info_attributes(
    tmp_path: Path,
) -> None:
    """Repository-local info attributes cannot alter exact committed source bytes."""
    source = _repository(tmp_path)
    hidden = source / "tests" / "failing_test.py"
    hidden.parent.mkdir()
    hidden.write_text("raise AssertionError('must remain visible')\n", encoding="utf-8")
    head_sha = _commit(source)
    info_attributes = source / ".git" / "info" / "attributes"
    info_attributes.parent.mkdir(parents=True, exist_ok=True)
    info_attributes.write_text(
        "tests/failing_test.py export-ignore\n",
        encoding="utf-8",
    )

    snapshot = _materialize(source, head_sha, tmp_path)

    assert (snapshot / "tests" / "failing_test.py").read_bytes() == hidden.read_bytes()


def test_runner_mounts_only_one_size_limited_result_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Untrusted code receives one host file and a realistic finite file ceiling."""
    source = tmp_path / "authenticated-source"
    source.mkdir()
    (source / "src").mkdir()
    (source / "src" / "example.ts").write_text("old\n", encoding="utf-8")
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = _request(patch_bytes)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def successful(command, **_kwargs):
        """Write evidence only through the single pre-created result-file mount."""
        command_list = list(command)
        result_path = _mount_source(command_list, "/output/result.json")
        destinations = _mount_destinations(command_list)
        assert "/output" not in destinations
        assert destinations.count("/output/result.json") == 1
        assert (
            f"--ulimit=fsize={patch_validation.MAX_SOURCE_ARCHIVE_FILE_BYTES}:"
            f"{patch_validation.MAX_SOURCE_ARCHIVE_FILE_BYTES}"
        ) in command_list
        result_path.write_text(_result_json(request), encoding="utf-8")
        return SimpleNamespace(returncode=0)

    result = DockerPatchValidationRunner(command_runner=successful).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )

    assert result.status is PatchValidationStatus.PASSED
