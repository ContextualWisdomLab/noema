#!/usr/bin/env python3
"""Apply the exact-commit source snapshot repair for pull request 65."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: Path, old: str, new: str) -> None:
    """Replace one exact source fragment or fail without partially editing it."""

    source = path.read_text(encoding="utf-8")
    old_text = dedent(old)
    new_text = dedent(new)
    count = source.count(old_text)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement target, found {count}")
    path.write_text(source.replace(old_text, new_text, 1), encoding="utf-8")


def repair_production_snapshot_boundary() -> None:
    """Materialize Git-backed source from the requested commit before Docker."""

    path = ROOT / "reviewer/noema_reviewer/patch_validation.py"
    replace_once(
        path,
        """
        import stat
        import subprocess
        import tempfile
        """,
        """
        import stat
        import subprocess
        import tarfile
        import tempfile
        """,
    )
    replace_once(
        path,
        """
        def _create_git_metadata_mask(
            staging_root: Path,
            metadata_kind: GitMetadataKind | None,
        ) -> Path | None:
        """,
        """
        def _materialize_source_snapshot(
            source: Path,
            expected_head_sha: str,
            metadata_kind: GitMetadataKind | None,
            staging_root: Path,
        ) -> Path:
            """Return a private exact-commit snapshot for Git-backed source trees."""
            if metadata_kind is None:
                return source

            snapshot = staging_root / "source-snapshot"
            snapshot.mkdir(mode=0o700)
            archive_path = staging_root / "source-snapshot.tar"
            completed = subprocess.run(
                [
                    TRUSTED_GIT_EXECUTABLE,
                    "-c",
                    "core.hooksPath=/dev/null",
                    "-c",
                    "core.fsmonitor=false",
                    "-C",
                    str(source),
                    "archive",
                    "--format=tar",
                    "--output",
                    str(archive_path),
                    expected_head_sha,
                ],
                text=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                shell=False,
                timeout=60,
                env={
                    "PATH": str(Path(TRUSTED_GIT_EXECUTABLE).parent),
                    "GIT_CONFIG_NOSYSTEM": "1",
                    "GIT_CONFIG_GLOBAL": os.devnull,
                    "GIT_OPTIONAL_LOCKS": "0",
                },
            )
            if completed.returncode != 0:
                raise RuntimeError("exact source snapshot could not be materialized")

            with tarfile.open(archive_path, mode="r:") as archive:
                archive.extractall(snapshot, filter="data")
            archive_path.unlink()

            metadata_placeholder = snapshot / ".git"
            if metadata_kind == "directory":
                metadata_placeholder.mkdir(mode=0o700)
            else:
                metadata_placeholder.touch(mode=0o400)
            return _validated_docker_mount_path(snapshot, "source snapshot")


        def _create_git_metadata_mask(
            staging_root: Path,
            metadata_kind: GitMetadataKind | None,
        ) -> Path | None:
        """,
    )
    replace_once(
        path,
        """
                staging_root = _validated_docker_mount_path(Path(staging), "staging root")
                staged_patch = _write_private_patch_copy(staging_root, patch_bytes)
        """,
        """
                staging_root = _validated_docker_mount_path(Path(staging), "staging root")
                source_snapshot = _materialize_source_snapshot(
                    source,
                    request.head_sha,
                    metadata_kind,
                    staging_root,
                )
                staged_patch = _write_private_patch_copy(staging_root, patch_bytes)
        """,
    )
    replace_once(
        path,
        """
                    f"--mount=type=bind,src={source},dst=/input,readonly",
        """,
        """
                    f"--mount=type=bind,src={source_snapshot},dst=/input,readonly",
        """,
    )


def repair_regression_contract() -> None:
    """Cover Git archive failure without weakening the existing mutation test."""

    path = ROOT / "reviewer/tests/test_patch_validation_source_integrity.py"
    replace_once(
        path,
        """
        def test_runner_mounts_committed_snapshot_after_post_preflight_mutation(
        """,
        """
        def test_git_snapshot_materialization_fails_closed_when_archive_fails(
            tmp_path: Path,
            monkeypatch: pytest.MonkeyPatch,
        ) -> None:
            """A failed exact-commit archive cannot fall back to the mutable worktree."""

            staging_root = tmp_path / "staging"
            staging_root.mkdir()
            monkeypatch.setattr(
                patch_validation.subprocess,
                "run",
                lambda *args, **kwargs: SimpleNamespace(returncode=1),
            )

            with pytest.raises(RuntimeError, match="snapshot could not be materialized"):
                patch_validation._materialize_source_snapshot(  # noqa: SLF001
                    tmp_path / "source",
                    "2" * 40,
                    "directory",
                    staging_root,
                )


        def test_runner_mounts_committed_snapshot_after_post_preflight_mutation(
        """,
    )


def update_documentation() -> None:
    """Record the immutable source snapshot trust boundary and verification."""

    doctoring = ROOT / "docs/doctoring/quarantined-patch-validation.md"
    replace_once(
        doctoring,
        """
        The full source checkout is mounted read-only at `/input`, but the runner immediately overlays `/input/.git` with a second private empty bind mount. A normal repository receives an empty directory mask; a linked worktree receives an empty regular-file mask. The mask matches the host object type so Docker can apply the nested mount without exposing the original control object.
        """,
        """
        For Git-backed input, the trusted host materializes the exact requested head SHA with non-shell `git archive` into an owner-only temporary source snapshot after the cleanliness preflight. Extraction uses Python's `tarfile` data filter, and the original mutable worktree is never mounted into Docker. A post-preflight worktree mutation therefore cannot change the bytes validated by the container. Non-Git input retains its explicitly documented privileged-caller trust boundary because the runner has no Git object identity from which to reconstruct it.

        The private source snapshot is mounted read-only at `/input`, and the runner overlays `/input/.git` with a second private empty bind mount. A normal repository receives an empty directory mask; a linked worktree receives an empty regular-file mask. The mask matches the host object type so Docker can apply the nested mount without exposing the original control object.
        """,
    )
    replace_once(
        doctoring,
        """
        - a Git source HEAD mismatch blocks Docker before untrusted execution;
        """,
        """
        - a Git source HEAD mismatch blocks Docker before untrusted execution;
        - a mutation after the Git cleanliness preflight cannot alter the exact-commit source snapshot mounted into Docker;
        - failure to materialize the exact requested commit fails closed instead of mounting the mutable worktree;
        """,
    )

    changelog = ROOT / "CHANGELOG.md"
    replace_once(
        changelog,
        """
        ## Unreleased
        """,
        """
        ## Unreleased
        - quarantined patch validation이 Git cleanliness preflight 후 원본 worktree를 직접 bind mount하던 TOCTOU 경계를 제거했다. Git-backed source는 요청된 exact head SHA를 private `git archive` snapshot으로 materialize하고 Python `tarfile` data filter로 추출한 뒤 read-only mount하며, post-preflight worktree mutation과 archive materialization failure를 현실 회귀 테스트로 차단한다. 기존 `.git` credential mask, non-Git privileged-caller 경계, 100% production statement/branch/docstring gate를 유지한다.
        """,
    )


def main() -> int:
    """Apply all guarded source, test, documentation, and changelog edits."""

    repair_production_snapshot_boundary()
    repair_regression_contract()
    update_documentation()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
