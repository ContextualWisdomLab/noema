"""Regression coverage for exact-byte reviewer changed-file evidence."""

from __future__ import annotations

import base64
import json

from noema_reviewer.github_io import fetch_manifest


HEAD_SHA = "a" * 40
BASE_SHA = "b" * 40
REPO = "ContextualWisdomLab/example"


class InvalidUtf8Runner:
    """Return one current-head changed file whose contents are not valid UTF-8."""

    def __call__(self, args, stdin=None):
        joined = " ".join(args)
        if "Accept: application/vnd.github.v3.diff" in joined:
            return "diff --git a/x.py b/x.py\n+binary-ish"
        if "{title: .title" in joined:
            return json.dumps(
                {"title": "invalid utf8", "head": HEAD_SHA, "base": BASE_SHA, "state": "open"}
            )
        if "/files" in joined:
            return "x.py\n"
        if "/contents/x.py" in joined:
            return base64.b64encode(b"before\xffafter").decode("ascii")
        if "/check-runs" in joined:
            if "select(.conclusion" in joined:
                return ""
            return json.dumps({"name": "ci", "conclusion": "success"})
        if " api graphql " in f" {joined} ":
            return ""
        if "/reviews" in joined or "/issues/" in joined:
            return ""
        if "/code-scanning/alerts" in joined or "/dependabot/alerts" in joined:
            return ""
        return ""


def codegraph_runner(args, source_root):
    """Keep unrelated CodeGraph evidence available in this focused fixture."""
    return "ok"


def test_invalid_utf8_changed_file_is_not_normalized_into_review_evidence() -> None:
    """Malformed bytes must become an explicit evidence failure, never U+FFFD source text."""
    manifest = fetch_manifest(
        REPO,
        5,
        runner=InvalidUtf8Runner(),
        source_root="/target",
        codegraph_runner=codegraph_runner,
    )

    assert manifest.changed_files[0].path == "x.py"
    assert manifest.changed_files[0].content == ""
    assert "\ufffd" not in manifest.changed_files[0].content
    assert any(
        "changed-file content x.py" in failure and "UTF-8" in failure
        for failure in manifest.evidence_failures
    )
