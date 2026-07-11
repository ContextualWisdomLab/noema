"""Command-line entry point for the Noema second reviewer.

Every side-effecting seam — building the agent, loading the manifest, and
publishing — is injectable, so :func:`run_review` runs fully offline in tests
while :func:`main` wires the production defaults (a live model, ``gh`` I/O).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable

from .agent import ReviewAgent, build_agent
from .github_io import fetch_manifest, publish_verdict
from .manifest import ReviewManifest
from .models import ReviewVerdict, Verdict


AgentFactory = Callable[[], ReviewAgent]
ManifestLoader = Callable[[argparse.Namespace], ReviewManifest]
Publisher = Callable[[str, int, ReviewVerdict, str, str], str]


def _load_manifest(args: argparse.Namespace) -> ReviewManifest:
    """Load a manifest from a file when given, else fetch it from GitHub."""
    if args.manifest_file:
        with open(args.manifest_file, encoding="utf-8") as handle:
            return ReviewManifest.model_validate_json(handle.read())
    return fetch_manifest(args.repo, args.pr_number)


def _publish(repo: str, pr_number: int, verdict: ReviewVerdict, head_sha: str, token_source: str) -> str:
    """Publish a verdict to GitHub, adapting to the injectable publisher signature."""
    return publish_verdict(repo, pr_number, verdict, head_sha, token_source=token_source)


def parse_args(argv: list[str]) -> argparse.Namespace:
    """Parse the reviewer CLI arguments."""
    parser = argparse.ArgumentParser(prog="noema_reviewer", description="Noema independent PR reviewer.")
    parser.add_argument("--repo", default="", help="Target repository in owner/name form.")
    parser.add_argument("--pr-number", type=int, default=0, help="Pull request number.")
    parser.add_argument("--manifest-file", default="", help="Path to a prepared manifest JSON (skips GitHub fetch).")
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

    Returns 0 for approve/blocked (the reviewer completed and published its
    honest verdict) and 2 for request_changes, so a caller can branch on the
    reviewer's judgement without parsing the body.
    """
    resolved_factory = agent_factory or build_agent
    resolved_loader = manifest_loader or _load_manifest
    resolved_publisher = publisher or _publish

    manifest = resolved_loader(args)
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

    return 2 if verdict.verdict is Verdict.REQUEST_CHANGES else 0


def main(argv: list[str] | None = None) -> int:
    """Parse arguments and run the reviewer with production defaults."""
    args = parse_args(argv if argv is not None else sys.argv[1:])
    if not args.manifest_file and (not args.repo or args.pr_number <= 0):
        raise SystemExit("--repo and --pr-number are required unless --manifest-file is given")
    return run_review(args)
