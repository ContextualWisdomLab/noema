"""Fail-closed regression for changed-file evidence collection."""

from __future__ import annotations

import json

import pytest

from noema_reviewer.github_io import (
    _decode_changed_file_paths,
    _validate_empty_changed_file_metadata,
    fetch_manifest,
)


HEAD_SHA = "a" * 40
BASE_SHA = "b" * 40


class ContentsFailureRunner:
    """Return valid review evidence except for current-head file contents."""

    def __call__(self, args, stdin=None):
        """Model one exact changed-file contents endpoint failure."""
        joined = " ".join(args)
        if "Accept: application/vnd.github.v3.diff" in joined:
            return "diff --git a/src/x.py b/src/x.py\n+new line"
        if "{title: .title" in joined:
            return json.dumps(
                {"title": "PR title", "head": HEAD_SHA, "base": BASE_SHA, "state": "open"}
            )
        if "/files" in joined:
            return json.dumps("src/x.py") + "\n"
        if "/contents/src/x.py" in joined:
            raise RuntimeError("contents endpoint unavailable")
        if "/check-runs" in joined:
            return ""
        if " api graphql " in f" {joined} ":
            return ""
        if "/reviews" in joined or "/comments" in joined:
            return ""
        if "/code-scanning/alerts" in joined or "/dependabot/alerts" in joined:
            return ""
        return ""


class MalformedContentsRunner(ContentsFailureRunner):
    """Return a syntactically invalid base64 payload for current-head contents."""

    def __call__(self, args, stdin=None):
        """Model provider corruption that permissive base64 decoding must not hide."""
        joined = " ".join(args)
        if "/contents/src/x.py" in joined:
            return "YWJj$\n"
        return super().__call__(args, stdin)


class ReservedPathRunner(ContentsFailureRunner):
    """Require reserved filename characters to stay inside the contents path."""

    changed_path = "src/review?mode=#x.py"
    encoded_path = "src/review%3Fmode%3D%23x.py"

    def __call__(self, args, stdin=None):
        """Reject a contents request whose filename changes the endpoint query."""
        joined = " ".join(args)
        if "Accept: application/vnd.github.v3.diff" in joined:
            return f"diff --git a/{self.changed_path} b/{self.changed_path}\n+new line"
        if "{title: .title" in joined:
            return json.dumps(
                {"title": "PR title", "head": HEAD_SHA, "base": BASE_SHA, "state": "open"}
            )
        if "/files" in joined:
            return json.dumps(self.changed_path) + "\n"
        if f"/contents/{self.encoded_path}?ref={HEAD_SHA}" in joined:
            return "YWJj\n"
        if "/contents/" in joined:
            raise RuntimeError("reserved path characters escaped the contents path")
        if "/check-runs" in joined:
            return ""
        if " api graphql " in f" {joined} ":
            return ""
        if "/reviews" in joined or "/comments" in joined:
            return ""
        if "/code-scanning/alerts" in joined or "/dependabot/alerts" in joined:
            return ""
        return ""


class ExactFilenameRunner(ContentsFailureRunner):
    """Expose a filename that line-oriented unescaped collection cannot preserve."""

    changed_path = " src/review\nline.py "
    encoded_path = "%20src/review%0Aline.py%20"

    def __call__(self, args, stdin=None):
        """Return line-safe JSON only when the collector explicitly requests it."""
        joined = " ".join(args)
        if "Accept: application/vnd.github.v3.diff" in joined:
            return "diff --git a/source b/target\n+new line"
        if "{title: .title" in joined:
            return json.dumps(
                {"title": "PR title", "head": HEAD_SHA, "base": BASE_SHA, "state": "open"}
            )
        if "/files" in joined:
            if "@json" in joined:
                return json.dumps(self.changed_path) + "\n"
            return self.changed_path + "\n"
        if f"/contents/{self.encoded_path}?ref={HEAD_SHA}" in joined:
            return "YWJj\n"
        if "/contents/" in joined:
            raise RuntimeError("changed filename identity was not preserved")
        if "/check-runs" in joined:
            return ""
        if " api graphql " in f" {joined} ":
            return ""
        if "/reviews" in joined or "/comments" in joined:
            return ""
        if "/code-scanning/alerts" in joined or "/dependabot/alerts" in joined:
            return ""
        return ""


class OmittedLargeContentsRunner(ContentsFailureRunner):
    """Model the Contents API omitting inline bytes for a non-empty large file."""

    def __call__(self, args, stdin=None):
        """Expose size/encoding metadata only when the collector asks for it."""
        joined = " ".join(args)
        if "/contents/src/x.py" in joined:
            if "{type:" in joined:
                return json.dumps({"type": "file", "encoding": "none", "size": 1_048_577})
            return ""
        return super().__call__(args, stdin)


class EmptyContentsRunner(ContentsFailureRunner):
    """Model a genuinely empty current-head file."""

    def __call__(self, args, stdin=None):
        """Return zero-size metadata when inline content is empty by definition."""
        joined = " ".join(args)
        if "/contents/src/x.py" in joined:
            if "{type:" in joined:
                return json.dumps({"type": "file", "encoding": "base64", "size": 0})
            return ""
        return super().__call__(args, stdin)


def test_changed_file_fetch_failure_is_retained_as_blocking_evidence_failure() -> None:
    """Missing current-head file context must never become a silent empty file."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=ContentsFailureRunner(),
    )

    assert manifest.changed_files[0].path == "src/x.py"
    assert manifest.changed_files[0].content == ""
    assert any(
        failure.startswith("changed-file content src/x.py: contents endpoint unavailable")
        for failure in manifest.evidence_failures
    )


def test_malformed_base64_changed_file_is_retained_as_blocking_evidence_failure() -> None:
    """Provider-corrupted base64 must not be permissively decoded into trusted context."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=MalformedContentsRunner(),
    )

    assert manifest.changed_files[0].path == "src/x.py"
    assert manifest.changed_files[0].content == ""
    assert any(
        failure == "changed-file content src/x.py: invalid base64 current-head contents"
        for failure in manifest.evidence_failures
    )


def test_reserved_filename_characters_are_percent_encoded_for_contents_lookup() -> None:
    """A changed filename must not be able to alter the contents endpoint query grammar."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=ReservedPathRunner(),
    )

    assert manifest.changed_files[0].path == ReservedPathRunner.changed_path
    assert manifest.changed_files[0].content == "abc"
    assert not any(
        failure.startswith(f"changed-file content {ReservedPathRunner.changed_path}:")
        for failure in manifest.evidence_failures
    )


def test_changed_filename_whitespace_and_newline_identity_is_preserved() -> None:
    """List transport must not split or trim valid Git filename bytes before lookup."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=ExactFilenameRunner(),
    )

    assert [file.path for file in manifest.changed_files] == [ExactFilenameRunner.changed_path]
    assert manifest.changed_files[0].content == "abc"
    assert not any(
        failure.startswith("changed-file content")
        for failure in manifest.evidence_failures
    )


def test_changed_path_inventory_ignores_transport_blank_lines() -> None:
    """Blank transport rows are ignored without mutating adjacent JSON filename bytes."""
    raw = f"\n{json.dumps(' src/x.py ')}\n\n"
    assert _decode_changed_file_paths(raw) == [" src/x.py "]


@pytest.mark.parametrize("raw", ["not-json", json.dumps(7), json.dumps("")])
def test_changed_path_inventory_rejects_malformed_or_non_filename_rows(raw: str) -> None:
    """Malformed, non-string, and empty rows cannot become changed-file identities."""
    with pytest.raises(RuntimeError, match="changed-file path inventory"):
        _decode_changed_file_paths(raw)


def test_omitted_nonempty_contents_are_retained_as_blocking_evidence_failure() -> None:
    """An API size boundary must not make a non-empty file look like trusted empty text."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=OmittedLargeContentsRunner(),
    )

    assert manifest.changed_files[0].content == ""
    assert any(
        failure == "changed-file content src/x.py: current-head contents omitted for non-empty file"
        for failure in manifest.evidence_failures
    )


def test_genuinely_empty_changed_file_remains_valid_empty_context() -> None:
    """A zero-byte current-head file remains valid evidence rather than a false failure."""
    manifest = fetch_manifest(
        "ContextualWisdomLab/example",
        1,
        runner=EmptyContentsRunner(),
    )

    assert manifest.changed_files[0].content == ""
    assert not any(
        failure.startswith("changed-file content src/x.py:")
        for failure in manifest.evidence_failures
    )


@pytest.mark.parametrize(
    ("raw", "reason"),
    [
        ("not-json", "metadata unavailable or invalid"),
        (json.dumps([]), "metadata unavailable or invalid"),
        (json.dumps({"type": "dir", "encoding": "base64", "size": 0}), "metadata is not a file"),
        (json.dumps({"type": "file", "encoding": "base64", "size": True}), "metadata has invalid size"),
        (json.dumps({"type": "file", "encoding": "base64", "size": "0"}), "metadata has invalid size"),
        (json.dumps({"type": "file", "encoding": "base64", "size": -1}), "metadata has invalid size"),
        (json.dumps({"type": "file", "encoding": "none", "size": 0}), "unsupported encoding"),
    ],
)
def test_empty_contents_metadata_rejects_untrusted_shapes(raw: str, reason: str) -> None:
    """Only a real zero-byte base64 file may justify omitted inline content."""

    def runner(args, stdin=None):
        """Return one exact metadata payload for the validation boundary."""
        return raw

    with pytest.raises(RuntimeError, match=reason):
        _validate_empty_changed_file_metadata("repos/o/r/contents/x?ref=head", runner)
