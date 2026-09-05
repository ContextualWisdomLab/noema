"""Command-line entry point for the Noema second reviewer.

Every side-effecting seam — building the agent, loading the manifest, and
publishing — is injectable, so :func:`run_review` runs fully offline in tests
while :func:`main` wires the production defaults (a live model, ``gh`` I/O).
"""

from __future__ import annotations

import argparse
import os
import re
import stat
import sys
from collections.abc import Callable, Sequence

from .agent import ReviewAgent, build_agent
from .github_io import default_codegraph_runner, fetch_manifest, publish_verdict
from .manifest import ReviewManifest
from .models import ReviewVerdict, Verdict


AgentFactory = Callable[[], ReviewAgent]
ManifestLoader = Callable[[argparse.Namespace], ReviewManifest]
Publisher = Callable[[str, int, ReviewVerdict, str, str], str]
CodeGraphRunner = Callable[[Sequence[str], str], str]

CODEGRAPH_EXPLORE_MARKER = "## codegraph explore"
RAW_CODEGRAPH_EXPLORE_MARKER = "[raw CodeGraph explore marker]"
CODEGRAPH_CHANGED_FILES_PREFIX = "for these current-head changed files:"
CODEGRAPH_EMPTY_RESULT_RE = re.compile(r"^\s*No\s+relevant\s+code\s+found\b", re.IGNORECASE)
CODEGRAPH_LIFECYCLE_OUTPUTS = frozenset(
    {
        "initialized",
        "synced",
        "index is up to date",
        "codegraph initialized; status produced no output.",
    }
)
CODEGRAPH_SYMBOL_MAP_MARKER = "**Symbols"
MAX_CODEGRAPH_SYMBOL_SEED_FILES = 8
MAX_CODEGRAPH_SYMBOL_SEED_CHARS = 300
MAX_CODEGRAPH_CHANGED_SCOPE_FILES = 80
MAX_CODEGRAPH_CHANGED_SCOPE_TOKENS = 512
MAX_CODEGRAPH_CHANGED_SCOPE_PATH_PROBES = 4096


def _is_current_head_regular_file(source_root: str, path: str) -> bool:
    """Return whether a query path stays inside a physical checkout without symlink traversal."""
    if not source_root or not path or os.path.isabs(path):
        return False
    parts = path.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        return False

    current = os.path.abspath(source_root)
    try:
        root_mode = os.lstat(current).st_mode
        if stat.S_ISLNK(root_mode) or not stat.S_ISDIR(root_mode):
            return False
        if os.path.realpath(current) != current:
            return False
        for index, part in enumerate(parts):
            current = os.path.join(current, part)
            mode = os.lstat(current).st_mode
            if index < len(parts) - 1:
                if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                    return False
            elif not stat.S_ISREG(mode):
                return False
    except OSError:
        return False
    return True


def _codegraph_changed_paths(query: str, source_root: str) -> list[str]:
    """Recover one unambiguous current-head path segmentation from the bounded query."""
    raw_scope = query.partition(CODEGRAPH_CHANGED_FILES_PREFIX)[2]
    if not raw_scope:
        return []
    # _fetch_codegraph_status inserts exactly one delimiter space before the scope.
    # Remove only that byte: additional leading/trailing/internal whitespace can be
    # part of a legitimate Git filename and must reach the filesystem unchanged.
    scope = raw_scope[1:] if raw_scope.startswith(" ") else raw_scope
    if not scope or scope.count(" ") + 1 > MAX_CODEGRAPH_CHANGED_SCOPE_TOKENS:
        return []

    boundary_ends = [index for index, char in enumerate(scope) if char == " "]
    boundary_starts = [0, *(index + 1 for index in boundary_ends)]
    boundary_ends.append(len(scope))
    partition_counts = [0] * (len(scope) + 1)
    partitions: list[list[str] | None] = [None] * (len(scope) + 1)
    partition_counts[-1] = 1
    partitions[-1] = []
    path_probes = 0

    for cursor in reversed(boundary_starts):
        for end in boundary_ends:
            if end <= cursor:
                continue
            at_scope_end = end == len(scope)
            next_cursor = end if at_scope_end else end + 1
            if partition_counts[next_cursor] == 0:
                continue
            candidate = scope[cursor:end]
            if not candidate:
                continue
            path_probes += 1
            if path_probes > MAX_CODEGRAPH_CHANGED_SCOPE_PATH_PROBES:
                return []
            if not _is_current_head_regular_file(source_root, candidate):
                continue
            partition_counts[cursor] = min(
                2,
                partition_counts[cursor] + partition_counts[next_cursor],
            )
            if partitions[cursor] is None and partitions[next_cursor] is not None:
                partitions[cursor] = [candidate, *partitions[next_cursor]]
            if partition_counts[cursor] > 1:
                break

    paths = partitions[0]
    if (
        partition_counts[0] != 1
        or paths is None
        or len(paths) > MAX_CODEGRAPH_CHANGED_SCOPE_FILES
        or len(paths) > MAX_CODEGRAPH_SYMBOL_SEED_FILES
    ):
        return []
    return paths


def _codegraph_symbol_seed(
    query: str,
    source_root: str,
    runner: CodeGraphRunner | None = None,
) -> str:
    """Return indexed-symbol maps only when the complete changed-file scope is covered."""
    paths = _codegraph_changed_paths(query, source_root)
    if not paths:
        return ""

    active_runner = runner or default_codegraph_runner
    seeds: list[str] = []
    for path in paths:
        try:
            node_output = active_runner(
                ["codegraph", "node", "--file", path, "--symbols-only"],
                source_root,
            ).strip()
        except RuntimeError:
            return ""
        if (
            CODEGRAPH_SYMBOL_MAP_MARKER not in node_output
            or len(node_output) > MAX_CODEGRAPH_SYMBOL_SEED_CHARS
        ):
            return ""
        seeds.append(f"{path}\n{node_output}")
    return "\n\n".join(seeds)


def _is_explicit_codegraph_empty_result(output: str) -> bool:
    """Recognize an empty explore response after only known lifecycle banners."""
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    while lines and lines[0].lower() in CODEGRAPH_LIFECYCLE_OUTPUTS:
        lines.pop(0)
    return bool(lines and CODEGRAPH_EMPTY_RESULT_RE.match(lines[0]))


def _retry_empty_codegraph_explore(
    args: Sequence[str],
    source_root: str,
    output: str,
    runner: CodeGraphRunner | None = None,
) -> str:
    """Retry a path-only empty explore with bounded indexed-symbol retrieval seeds."""
    if not _is_explicit_codegraph_empty_result(output):
        return output
    active_runner = runner or default_codegraph_runner
    query = " ".join(str(arg) for arg in args[2:])
    seed = _codegraph_symbol_seed(query, source_root, active_runner)
    if not seed:
        return output
    retry_args = list(args)
    retry_args[2:] = [
        f"{query}\n\nIndexed changed-file symbol maps (retrieval seeds only):\n{seed}"
    ]
    return active_runner(retry_args, source_root)


def _semantic_codegraph_output(
    args: Sequence[str],
    source_root: str,
    runner: CodeGraphRunner,
) -> str:
    """Attach wrapper-owned explore provenance to one injected CodeGraph runner."""
    output = runner(args, source_root)
    if len(args) < 2 or args[1] != "explore":
        return output
    output = _retry_empty_codegraph_explore(args, source_root, output, runner)
    stripped = output.strip()
    if stripped:
        sanitized = re.sub(
            re.escape(CODEGRAPH_EXPLORE_MARKER),
            RAW_CODEGRAPH_EXPLORE_MARKER,
            output,
            flags=re.IGNORECASE,
        )
        retained_non_marker = "\n".join(
            line
            for line in sanitized.splitlines()
            if RAW_CODEGRAPH_EXPLORE_MARKER.lower() not in line.lower()
        ).strip()
        if retained_non_marker:
            return f"{CODEGRAPH_EXPLORE_MARKER}\n{retained_non_marker}"
        return CODEGRAPH_EXPLORE_MARKER
    return CODEGRAPH_EXPLORE_MARKER


def build_semantic_codegraph_runner(runner: CodeGraphRunner) -> CodeGraphRunner:
    """Bind semantic provenance and retry recovery to a reviewed execution boundary."""

    def semantic_runner(args: Sequence[str], source_root: str) -> str:
        return _semantic_codegraph_output(args, source_root, runner)

    return semantic_runner


def _semantic_codegraph_runner(args: Sequence[str], source_root: str) -> str:
    """Run semantic CodeGraph collection with the local least-authority fallback."""
    return _semantic_codegraph_output(args, source_root, default_codegraph_runner)


def _load_manifest(args: argparse.Namespace) -> ReviewManifest:
    """Load a manifest from a file when given, else fetch it from GitHub."""
    if args.manifest_file:
        with open(args.manifest_file, encoding="utf-8") as handle:
            return ReviewManifest.model_validate_json(handle.read())
    return fetch_manifest(
        args.repo,
        args.pr_number,
        source_root=args.source_root,
        codegraph_runner=_semantic_codegraph_runner,
    )


def _publish(repo: str, pr_number: int, verdict: ReviewVerdict, head_sha: str, token_source: str) -> str:
    """Publish a verdict to GitHub, adapting to the injectable publisher signature."""
    return publish_verdict(repo, pr_number, verdict, head_sha, token_source=token_source)


def parse_args(argv: list[str]) -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(prog="noema_reviewer", description="Noema independent PR reviewer.")
    parser.add_argument("--repo", default="", help="Target repository in owner/name form.")
    parser.add_argument("--pr-number", type=int, default=0, help="Pull request number.")
    parser.add_argument("--manifest-file", default="", help="Path to a prepared manifest JSON (skips GitHub fetch).")
    parser.add_argument(
        "--source-root",
        default="",
        help="Checked-out target root where CodeGraph must be initialized.",
    )
    parser.add_argument("--strict", action="store_true", help="Block when required evidence is missing.")
    parser.add_argument("--publish", action="store_true", help="Submit the verdict as a GitHub review.")
    parser.add_argument("--output", default="", help="Write the verdict JSON to this path instead of stdout.")
    parser.add_argument(
        "--token-source",
        default="NOEMA_REVIEW_TOKEN",
        help="Non-secret label recorded in the published review body.",
    )
    return parser.parse_args(argv)


def run_review(
    args: argparse.Namespace,
    *,
    agent_factory: AgentFactory | None = None,
    manifest_loader: ManifestLoader | None = None,
    publisher: Publisher | None = None,
    out=sys.stdout,
) -> int:
    """Run one review end to end and return a process exit code.

    The seams default to ``None`` and resolve to the module-level production
    functions at call time, so tests can monkeypatch ``build_agent`` /
    ``fetch_manifest`` and have ``main`` pick up the stub.

    Returns 0 only for approve, 2 for request_changes, and 3 for blocked so a
    caller cannot mistake missing strict evidence for a passing review check.
    """
    resolved_factory = agent_factory or build_agent
    resolved_loader = manifest_loader or _load_manifest
    resolved_publisher = publisher or _publish

    manifest = resolved_loader(args)
    print(
        f"Noema current-head evidence: {manifest.repo}#{manifest.pr_number} "
        f"head={manifest.head_sha} CodeGraph-bytes={len(manifest.codegraph_status)} "
        f"checks={len(manifest.check_conclusions)} comments={len(manifest.review_comments)}",
        file=sys.stderr,
    )
    agent = resolved_factory()
    verdict = agent.review(manifest, strict=args.strict)

    serialized = verdict.model_dump_json(indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(serialized)
    else:
        out.write(serialized + "\n")

    if args.publish:
        event = resolved_publisher(manifest.repo, manifest.pr_number, verdict, manifest.head_sha, args.token_source)
        out.write(f"Published Noema {event} review for {manifest.repo}#{manifest.pr_number}.\n")

    if verdict.verdict is Verdict.APPROVE:
        return 0
    if verdict.verdict is Verdict.REQUEST_CHANGES:
        return 2
    return 3


def main(argv: list[str] | None = None) -> int:
    """Parse arguments and run the reviewer with production defaults."""
    args = parse_args(argv if argv is not None else sys.argv[1:])
    if not args.manifest_file and (not args.repo or args.pr_number <= 0):
        raise SystemExit("--repo and --pr-number are required unless --manifest-file is given")
    return run_review(args)
