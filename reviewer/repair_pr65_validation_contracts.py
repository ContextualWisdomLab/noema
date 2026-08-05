#!/usr/bin/env python3
"""Apply the exact reviewed PR 65 validation-contract repairs once."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent


TARGET = Path("noema_reviewer/patch_validation.py")
WORKFLOW = Path("../.github/workflows/repair-pr65-validation-contracts.yml")
SCRIPT = Path(__file__)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    """Replace one exact source fragment or fail closed on branch drift."""
    old_text = dedent(old)
    new_text = dedent(new)
    count = source.count(old_text)
    if count != 1:
        raise SystemExit(f"{label}: expected one replacement, found {count}")
    return source.replace(old_text, new_text, 1)


def main() -> int:
    """Repair mode, hunk, provenance, and sandbox-identity validation."""
    source = TARGET.read_text(encoding="utf-8")
    source = replace_once(
        source,
        r'''
        PATCH_MODE_PATTERN = re.compile(
            r"^(?:old mode|new mode|new file mode|deleted file mode) (120000|160000)$",
            re.MULTILINE,
        )
        ''',
        r'''
        PATCH_MODE_PATTERN = re.compile(
            r"^(?:(?:old mode|new mode|new file mode|deleted file mode) "
            r"(?:120000|160000)|index [0-9a-f]{7,64}\.\.[0-9a-f]{7,64} "
            r"(?:120000|160000))$",
            re.MULTILINE,
        )
        ''',
        "special index mode gate",
    )

    function_start = source.index("def inspect_patch_bytes(patch_bytes: bytes) -> tuple[str, ...]:\n")
    function_end = source.index("\n\ndef _result_matches_request(", function_start)
    replacement = dedent(
        r'''
        def inspect_patch_bytes(patch_bytes: bytes) -> tuple[str, ...]:
            """Return changed paths after strict text, hunk, mode, path, and size validation."""
            if not patch_bytes:
                raise ValueError("patch must not be empty")
            if len(patch_bytes) > MAX_PATCH_BYTES:
                raise ValueError(f"patch exceeds {MAX_PATCH_BYTES} bytes")
            try:
                text = patch_bytes.decode("utf-8", errors="strict")
            except UnicodeDecodeError as exc:
                raise ValueError("patch must be valid UTF-8") from exc
            if "GIT binary patch" in text or "Binary files " in text:
                raise ValueError("binary patch payloads are not allowed")
            if PATCH_MODE_PATTERN.search(text):
                raise ValueError("patch contains a symlink or gitlink mode")

            changed_paths: list[str] = []
            in_hunk = False
            old_remaining = 0
            new_remaining = 0
            current_diff_has_hunk = False
            current_source_path: str | None = None
            current_target_path: str | None = None
            hunk_has_content = False
            hunk_has_terminal_marker = False

            for line in text.splitlines():
                if in_hunk:
                    if line == "\\ No newline at end of file":
                        if not hunk_has_content or hunk_has_terminal_marker:
                            raise ValueError("patch contains a malformed hunk marker")
                        hunk_has_terminal_marker = True
                        continue
                    if old_remaining == 0 and new_remaining == 0:
                        in_hunk = False
                        hunk_has_content = False
                        hunk_has_terminal_marker = False
                    else:
                        if not line:
                            raise ValueError("patch contains a malformed hunk body")
                        marker = line[0]
                        if marker == " ":
                            old_remaining -= 1
                            new_remaining -= 1
                        elif marker == "-":
                            old_remaining -= 1
                        elif marker == "+":
                            new_remaining -= 1
                        else:
                            raise ValueError("patch contains a malformed hunk body")
                        if old_remaining < 0 or new_remaining < 0:
                            raise ValueError("patch hunk contains more lines than declared")
                        hunk_has_content = True
                        hunk_has_terminal_marker = False
                        continue

                if line.startswith("diff --git "):
                    current_diff_has_hunk = False
                    if "\\" in line:
                        raise ValueError("patch contains an unsafe repository path")
                    try:
                        parts = shlex.split(line)
                    except ValueError as exc:
                        raise ValueError("patch contains a malformed diff header") from exc
                    if len(parts) != 4 or parts[:2] != ["diff", "--git"]:
                        raise ValueError("patch contains a malformed diff header")
                    current_source_path = _validated_patch_path(parts[2], "a/")
                    current_target_path = _validated_patch_path(parts[3], "b/")
                    if current_target_path in changed_paths:
                        raise ValueError(f"patch repeats changed path: {current_target_path}")
                    changed_paths.append(current_target_path)
                    if len(changed_paths) > MAX_CHANGED_FILES:
                        raise ValueError(f"patch changes more than {MAX_CHANGED_FILES} files")
                    continue

                if line.startswith("@@"):
                    if current_source_path is None or current_target_path is None:
                        raise ValueError("patch hunk appears before a diff header")
                    match = HUNK_HEADER_PATTERN.fullmatch(line)
                    if match is None:
                        raise ValueError("patch contains a malformed hunk header")
                    old_remaining = int(match.group("old_count") or "1")
                    new_remaining = int(match.group("new_count") or "1")
                    in_hunk = True
                    current_diff_has_hunk = True
                    hunk_has_content = False
                    hunk_has_terminal_marker = False
                    continue

                if current_source_path is not None and current_target_path is not None:
                    secondary_path = _validated_secondary_patch_header(line)
                    if current_diff_has_hunk:
                        if secondary_path is not None:
                            raise ValueError("patch contains path metadata after a hunk")
                        raise ValueError("patch contains trailing syntax after a hunk")
                    if secondary_path is not None:
                        role, normalized_path = secondary_path
                        expected_path = (
                            current_source_path if role == "source" else current_target_path
                        )
                        if normalized_path is not None and normalized_path != expected_path:
                            raise ValueError(
                                "secondary patch path does not match the primary diff path"
                            )

            if in_hunk and (old_remaining != 0 or new_remaining != 0):
                raise ValueError("patch hunk ended before its declared line counts")
            if not changed_paths:
                raise ValueError("patch contains no diff headers")
            return tuple(changed_paths)
        '''
    ).lstrip()
    source = source[:function_start] + replacement + source[function_end:]

    source = replace_once(
        source,
        r'''
                image = _verified_image_reference()
                metadata_kind = _git_metadata_kind(source)
                _verify_source_head(source, request.head_sha, metadata_kind)
                container_name = self._name_factory()
                uid = os.getuid()
                gid = os.getgid()
                child_environment = {"PATH": os.environ.get("PATH", os.defpath)}
        ''',
        r'''
                image = _verified_image_reference()
                metadata_kind = _git_metadata_kind(source)
                if metadata_kind is None:
                    raise RuntimeError(
                        "source Git metadata is required for exact-head validation"
                    )
                _verify_source_head(source, request.head_sha, metadata_kind)
                container_name = self._name_factory()
                uid = os.getuid()
                gid = os.getgid()
                if uid == 0 or gid == 0:
                    raise RuntimeError(
                        "patch validation requires a non-root host identity"
                    )
                child_environment = {"PATH": os.environ.get("PATH", os.defpath)}
        ''',
        "authenticated non-root source gate",
    )

    TARGET.write_text(source, encoding="utf-8")
    WORKFLOW.unlink(missing_ok=True)
    SCRIPT.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
