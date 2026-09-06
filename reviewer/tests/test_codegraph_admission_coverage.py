"""Edge coverage for fail-closed CodeGraph path and sandbox admission."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from noema_reviewer import cli, sandbox


@pytest.mark.parametrize(
    ("source_root", "path"),
    [
        ("", "a.ts"),
        ("/target", ""),
        ("/target", "/absolute.ts"),
        ("/target", "./a.ts"),
        ("/target", "a/../b.ts"),
        ("/target", "a//b.ts"),
    ],
)
def test_current_head_regular_file_rejects_invalid_relative_paths(
    source_root: str,
    path: str,
) -> None:
    """Invalid or non-relative path identities never become current-head symbol seeds."""
    assert cli._is_current_head_regular_file(source_root, path) is False


def test_current_head_regular_file_rejects_directory_as_file(tmp_path: Path) -> None:
    """A directory at the final path component cannot masquerade as source evidence."""
    (tmp_path / "directory.ts").mkdir()

    assert cli._is_current_head_regular_file(str(tmp_path), "directory.ts") is False


@pytest.mark.parametrize(
    "scope",
    [
        "[",
        json.dumps({"path": "a.ts"}, separators=(",", ":")),
        json.dumps([""], separators=(",", ":")),
        json.dumps([f"file-{index}.ts" for index in range(9)], separators=(",", ":")),
        json.dumps([f"file-{index}.ts" for index in range(81)], separators=(",", ":")),
    ],
)
def test_json_changed_scope_rejects_malformed_or_out_of_contract_payloads(
    tmp_path: Path,
    scope: str,
) -> None:
    """Malformed, non-list, empty-path, and over-budget JSON scopes fail closed."""
    query = f"{cli.CODEGRAPH_CHANGED_FILES_JSON_PREFIX} {scope}"

    assert cli._codegraph_json_changed_paths(query, str(tmp_path)) == []


def test_json_changed_scope_rejects_noncanonical_serialization(tmp_path: Path) -> None:
    """Only the canonical JSON byte representation can recover changed-file identity."""
    (tmp_path / "a.ts").write_text("export const a = true;\n", encoding="utf-8")
    query = f'{cli.CODEGRAPH_CHANGED_FILES_JSON_PREFIX} ["a.ts" ]'

    assert cli._codegraph_json_changed_paths(query, str(tmp_path)) == []


def test_json_changed_scope_rejects_missing_current_head_file(tmp_path: Path) -> None:
    """A canonical path absent from the checkout cannot seed semantic recovery."""
    scope = json.dumps(["missing.ts"], separators=(",", ":"))
    query = f"{cli.CODEGRAPH_CHANGED_FILES_JSON_PREFIX} {scope}"

    assert cli._codegraph_json_changed_paths(query, str(tmp_path)) == []


def test_validated_directory_rejects_regular_file(tmp_path: Path) -> None:
    """A regular file cannot be promoted to a trusted Docker bind-mount directory."""
    target = tmp_path / "not-a-directory"
    target.write_text("not a directory\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="must be a directory"):
        sandbox._validated_directory(target, "coverage target")
