"""Focused branch regressions for patch-validation fail-closed boundaries."""

from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    inspect_patch_bytes,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)


def _diff(*metadata: bytes, source: bytes = b"src/x", target: bytes = b"src/x") -> bytes:
    """Build one metadata-only Git diff with exact primary path identity."""
    return (
        b"diff --git a/"
        + source
        + b" b/"
        + target
        + b"\n"
        + b"".join(metadata)
    )


def _tree_record(
    path: str = "fixture.txt",
    *,
    mode: str = "100644",
    object_type: str = "blob",
    object_id: str = "a" * 40,
    size: str = "1",
) -> str:
    """Build one NUL-terminated `git ls-tree -l` record."""
    return f"{mode} {object_type} {object_id} {size}\t{path}\0"


def _ordinary_patch() -> bytes:
    """Return one canonical one-line text patch."""
    return (
        b"diff --git a/src/x b/src/x\n"
        b"--- a/src/x\n"
        b"+++ b/src/x\n"
        b"@@ -1 +1 @@\n"
        b"-old\n"
        b"+new\n"
    )


def test_git_control_reader_rejects_empty_file(tmp_path: Path) -> None:
    """An empty Git control file cannot be interpreted as one control line."""
    control_file = tmp_path / "git-control"
    control_file.touch()

    with pytest.raises(RuntimeError, match="invalid byte length"):
        patch_validation._read_git_control_line(control_file, "test control")


def test_git_control_reader_closes_safely_when_open_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A descriptor-open failure remains bounded before any descriptor exists."""
    control_file = tmp_path / "git-control"
    control_file.write_text("gitdir: objects\n", encoding="utf-8")

    def fail_open(*_args, **_kwargs):
        """Emulate a descriptor-open race without returning a descriptor."""
        raise OSError("open failed")

    monkeypatch.setattr(patch_validation.os, "open", fail_open)

    with pytest.raises(RuntimeError, match="could not be read safely"):
        patch_validation._read_git_control_line(control_file, "test control")


def test_git_directory_rejects_regular_file(tmp_path: Path) -> None:
    """A regular file cannot stand in for a required Git directory."""
    candidate = tmp_path / "not-a-directory"
    candidate.write_text("not a directory", encoding="utf-8")

    with pytest.raises(RuntimeError, match="regular directory"):
        patch_validation._validated_git_directory(
            candidate,
            "test Git directory",
            require_exists=True,
        )


@pytest.mark.parametrize(
    ("patch_bytes", "message"),
    (
        (
            _diff(b"--- a/src/x\n"),
            "incomplete secondary path metadata",
        ),
        (
            _diff(b"--- /dev/null\n", b"+++ /dev/null\n"),
            "invalid /dev/null path metadata",
        ),
        (
            _diff(
                b"--- /dev/null\n",
                b"+++ b/src/new\n",
                source=b"src/old",
                target=b"src/new",
            ),
            "noncanonical creation metadata",
        ),
        (
            _diff(
                b"--- a/src/old\n",
                b"+++ /dev/null\n",
                source=b"src/old",
                target=b"src/new",
            ),
            "noncanonical deletion metadata",
        ),
        (
            _diff(
                b"rename from src/old\n",
                b"rename to src/new\n",
                b"copy from src/old\n",
                b"copy to src/new\n",
                source=b"src/old",
                target=b"src/new",
            ),
            "conflicting rename and copy metadata",
        ),
    ),
)
def test_secondary_metadata_families_fail_closed(
    patch_bytes: bytes,
    message: str,
) -> None:
    """Incomplete, ambiguous, and noncanonical metadata families are rejected."""
    with pytest.raises(ValueError, match=message):
        inspect_patch_bytes(patch_bytes)


@pytest.mark.parametrize(
    ("patch_bytes", "message"),
    (
        (
            b"@@ -1 +1 @@\n-old\n+new\n"
            b"diff --git a/src/x b/src/x\n",
            "hunk appears before a diff header",
        ),
        (
            b"--- a/src/x\n"
            b"diff --git a/src/x b/src/x\n",
            "path metadata appears before a diff header",
        ),
        (
            _diff(
                b"--- a/src/x\n",
                b"--- a/src/x\n",
                b"+++ b/src/x\n",
            ),
            "repeats source path metadata",
        ),
        (
            b"index 1111..2222 100644\n"
            b"diff --git a/src/x b/src/x\n",
            "misplaced index metadata",
        ),
        (
            _diff(b"index nope\n"),
            "malformed index metadata",
        ),
        (
            _diff(b"index 1111..2222 100600\n"),
            "unsupported index mode",
        ),
        (
            b"new file mode 100644\n"
            b"diff --git a/src/x b/src/x\n",
            "misplaced mode metadata",
        ),
        (
            _diff(b"new file mode 100600\n"),
            "unsupported file mode",
        ),
        (
            b"similarity index 100%\n"
            b"diff --git a/src/x b/src/x\n",
            "misplaced similarity metadata",
        ),
        (
            _diff(b"similarity index nope\n"),
            "malformed similarity metadata",
        ),
        (
            _diff(b"similarity index 101%\n"),
            "malformed similarity metadata",
        ),
        (
            _diff(b"\\ No newline at end of file\n"),
            "malformed hunk newline marker",
        ),
    ),
)
def test_patch_metadata_placement_and_format_fail_closed(
    patch_bytes: bytes,
    message: str,
) -> None:
    """Misplaced, duplicate, malformed, and unsupported metadata is rejected."""
    with pytest.raises(ValueError, match=message):
        inspect_patch_bytes(patch_bytes)


def test_patch_inspector_accepts_unbound_blank_separator() -> None:
    """An empty separator line does not create an unbound syntax channel."""
    assert inspect_patch_bytes(_diff(b"\n")) == ("src/x",)


@pytest.mark.parametrize("raw_output", ("", "not NUL terminated"))
def test_exact_tree_rejects_empty_or_truncated_output(raw_output: str) -> None:
    """Exact-tree evidence must be nonempty and explicitly NUL terminated."""
    with pytest.raises(ValueError, match="empty or truncated"):
        patch_validation._validated_exact_tree_output(raw_output)


def test_exact_tree_rejects_excessive_member_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Prearchive inspection rejects a tree beyond the member ceiling."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_ARCHIVE_MEMBERS", 1)

    with pytest.raises(ValueError, match="too many members"):
        patch_validation._validated_exact_tree_output(
            _tree_record("one.txt") + _tree_record("two.txt")
        )


@pytest.mark.parametrize(
    ("raw_output", "message"),
    (
        ("metadata-without-tab\0", "malformed metadata"),
        ("100644 blob\tfixture.txt\0", "malformed metadata"),
        (_tree_record(mode="160000"), "non-regular object"),
        (_tree_record(object_type="tree"), "non-regular object"),
        (_tree_record(object_id="not-an-object-id"), "non-regular object"),
        (_tree_record(size="unknown"), "invalid blob size"),
    ),
)
def test_exact_tree_rejects_malformed_or_special_records(
    raw_output: str,
    message: str,
) -> None:
    """Malformed metadata, special objects, and unknown sizes fail closed."""
    with pytest.raises(ValueError, match=message):
        patch_validation._validated_exact_tree_output(raw_output)


def test_exact_tree_rejects_aggregate_size(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Aggregate blob bytes are bounded before archive serialization starts."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_ARCHIVE_TOTAL_BYTES", 1)

    with pytest.raises(ValueError, match="aggregate byte limit"):
        patch_validation._validated_exact_tree_output(
            _tree_record("one.txt") + _tree_record("two.txt")
        )


def test_exact_tree_rejects_duplicate_path() -> None:
    """Two object records cannot alias the same archive destination."""
    with pytest.raises(ValueError, match="repeats a member name"):
        patch_validation._validated_exact_tree_output(
            _tree_record("same.txt") + _tree_record("same.txt")
        )


def test_exact_tree_accepts_executable_sha256_blob() -> None:
    """Canonical executable blobs and SHA-256 object identities remain valid."""
    patch_validation._validated_exact_tree_output(
        _tree_record(mode="100755", object_id="b" * 64)
    )


def test_exact_tree_preflight_wraps_process_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """An operating-system launch failure cannot be mistaken for valid evidence."""

    def fail_popen(*_args, **_kwargs):
        """Emulate a trusted Git executable launch failure."""
        raise OSError("Git unavailable")

    monkeypatch.setattr(patch_validation.subprocess, "Popen", fail_popen)

    with pytest.raises(RuntimeError, match="could not be inspected safely"):
        patch_validation._verify_exact_tree_limits(tmp_path, "1" * 40)


def test_exact_tree_preflight_rejects_nonzero_git(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A failed exact-tree command produces no admissible tree evidence."""
    process = SimpleNamespace(stdout=None, poll=lambda: 1)
    chunks = iter(
        (
            f"100644 blob {'a' * 40} 1\tfixture.txt\0".encode(),
            b"",
        )
    )
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: process,
    )
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: next(chunks),
    )
    monkeypatch.setattr(
        patch_validation,
        "_wait_git_stream",
        lambda *_args, **_kwargs: 1,
    )

    with pytest.raises(RuntimeError, match="could not be inspected safely"):
        patch_validation._verify_exact_tree_limits(tmp_path, "1" * 40)


def test_materialization_wraps_isolated_control_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Failure to build isolated Git controls cannot fall back to local config."""
    source = tmp_path / "source"
    source.mkdir()
    staging = tmp_path / "staging"
    staging.mkdir()

    def fail_control(*_args, **_kwargs):
        """Emulate unavailable authenticated object storage."""
        raise RuntimeError("objects unavailable")

    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        fail_control,
    )

    with pytest.raises(RuntimeError, match="snapshot could not be materialized"):
        patch_validation._materialize_committed_source(
            source,
            "1" * 40,
            staging,
            "directory",
        )


def test_metadata_mask_is_absent_without_git_metadata(tmp_path: Path) -> None:
    """A checkout without Git metadata requires no nested Docker mask source."""
    assert patch_validation._create_git_metadata_mask(tmp_path, None) is None


def test_runner_rejects_missing_git_metadata_after_verified_preflight(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Exact-head validation still requires an authenticated Git metadata shape."""
    source = tmp_path / "source"
    source.mkdir()
    patch_bytes = _ordinary_patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha="2" * 40,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    monkeypatch.setattr(
        patch_validation,
        "_verify_source_head",
        lambda *_args, **_kwargs: None,
    )

    with pytest.raises(RuntimeError, match="Git metadata is required"):
        DockerPatchValidationRunner().validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )
