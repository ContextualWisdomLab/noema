"""Thin, injectable GitHub I/O for building manifests and publishing verdicts.

Every GitHub call goes through a ``GhRunner`` callable so the whole module is
driven offline in tests with a stub runner — no network, no ``gh`` binary, no
token. In production the default runner shells out to ``gh``.
"""

from __future__ import annotations

import base64
import json
import subprocess
from collections.abc import Callable, Sequence

from .manifest import ChangedFile, CheckConclusion, ReviewComment, ReviewManifest
from .models import ReviewVerdict, Verdict


GhRunner = Callable[[Sequence[str], str | None], str]

MAX_DIFF_CHARS = 60000
MAX_CONTEXT_FILES = 12
MAX_FILE_CONTEXT_CHARS = 4000

# GitHub review events keyed by our terminal verdicts. A ``blocked`` verdict is
# published as REQUEST_CHANGES because GitHub has no distinct "blocked" event,
# but the body preserves the blocked reasons.
REVIEW_EVENT_BY_VERDICT = {
    Verdict.APPROVE: "APPROVE",
    Verdict.REQUEST_CHANGES: "REQUEST_CHANGES",
    Verdict.BLOCKED: "REQUEST_CHANGES",
}


def default_runner(args: Sequence[str], stdin: str | None = None) -> str:
    """Run a ``gh`` command without a shell and return stdout."""
    completed = subprocess.run(
        list(args),
        input=stdin,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        shell=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed ({completed.returncode}): {args[0]}\n{completed.stderr.strip()}")
    return completed.stdout


def _truncate(text: str, limit: int) -> str:
    """Shorten text to a character budget with an explicit truncation note."""
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n[truncated {len(text) - limit} characters]"


def fetch_manifest(repo: str, pr_number: int, runner: GhRunner = default_runner) -> ReviewManifest:
    """Build a bounded :class:`ReviewManifest` for a pull request via ``gh``."""
    pr_json = json.loads(
        runner(
            [
                "gh",
                "api",
                f"repos/{repo}/pulls/{pr_number}",
                "--jq",
                "{title: .title, head: .head.sha, base: .base.sha}",
            ],
            None,
        )
    )
    head_sha = str(pr_json.get("head") or "")

    diff = runner(
        ["gh", "api", f"repos/{repo}/pulls/{pr_number}", "-H", "Accept: application/vnd.github.v3.diff"],
        None,
    )
    diff_truncated = len(diff) > MAX_DIFF_CHARS

    paths = [
        line.strip()
        for line in runner(
            ["gh", "api", f"repos/{repo}/pulls/{pr_number}/files", "--paginate", "--jq", ".[].filename"],
            None,
        ).splitlines()
        if line.strip()
    ]
    changed_files = [_fetch_changed_file(repo, path, head_sha, runner) for path in paths[:MAX_CONTEXT_FILES]]

    checks = _fetch_check_conclusions(repo, head_sha, runner)
    comments = _fetch_review_comments(repo, pr_number, runner)

    return ReviewManifest(
        repo=repo,
        pr_number=pr_number,
        title=str(pr_json.get("title") or ""),
        base_sha=str(pr_json.get("base") or ""),
        head_sha=head_sha,
        diff=_truncate(diff, MAX_DIFF_CHARS),
        diff_truncated=diff_truncated,
        changed_files=changed_files,
        check_conclusions=checks,
        review_comments=comments,
    )


def _fetch_changed_file(repo: str, path: str, head_sha: str, runner: GhRunner) -> ChangedFile:
    """Fetch a changed file's bounded current-head text content."""
    try:
        encoded = runner(
            ["gh", "api", f"repos/{repo}/contents/{path}?ref={head_sha}", "--jq", ".content // empty"],
            None,
        )
    except RuntimeError:
        return ChangedFile(path=path, content="")
    compact = "".join(encoded.split())
    if not compact:
        return ChangedFile(path=path, content="")
    decoded = base64.b64decode(compact).decode("utf-8", errors="replace")
    return ChangedFile(path=path, content=_truncate(decoded, MAX_FILE_CONTEXT_CHARS))


def _fetch_check_conclusions(repo: str, head_sha: str, runner: GhRunner) -> list[CheckConclusion]:
    """Fetch current check-run conclusions for the head commit."""
    if not head_sha:
        return []
    raw = runner(
        [
            "gh",
            "api",
            f"repos/{repo}/commits/{head_sha}/check-runs",
            "--jq",
            ".check_runs[] | {name: .name, conclusion: .conclusion}",
        ],
        None,
    )
    conclusions: list[CheckConclusion] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        node = json.loads(line)
        conclusions.append(
            CheckConclusion(name=str(node.get("name") or ""), conclusion=str(node.get("conclusion") or "pending"))
        )
    return conclusions


def _fetch_review_comments(repo: str, pr_number: int, runner: GhRunner) -> list[ReviewComment]:
    """Fetch prior review comments so the reviewer preserves their context."""
    raw = runner(
        [
            "gh",
            "api",
            f"repos/{repo}/pulls/{pr_number}/comments",
            "--paginate",
            "--jq",
            ".[] | {author: .user.login, path: .path, line: .line, body: .body}",
        ],
        None,
    )
    comments: list[ReviewComment] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        node = json.loads(line)
        comments.append(
            ReviewComment(
                author=str(node.get("author") or "unknown"),
                path=str(node.get("path") or ""),
                line=node.get("line"),
                body=str(node.get("body") or ""),
            )
        )
    return comments


def render_review_body(verdict: ReviewVerdict, head_sha: str, token_source: str) -> str:
    """Render the PR review body, including the interop marker the central gate detects."""
    finding_lines = [
        f"- [{finding.severity.value}] {finding.path}"
        + (f":{finding.line}" if finding.line else "")
        + f": {finding.recommendation} ({finding.evidence})"
        for finding in verdict.findings
    ] or ["- No blocking findings."]
    blocked_lines = [f"- {reason}" for reason in verdict.blocked_reasons]
    body = [
        "## Noema PydanticAI review",
        "",
        verdict.summary,
        "",
        "### Findings",
        *finding_lines,
    ]
    if blocked_lines:
        body.extend(["", "### Blocked reasons", *blocked_lines])
    body.extend(
        [
            "",
            f"- Result: {REVIEW_EVENT_BY_VERDICT[verdict.verdict]}",
            f"- Verdict: {verdict.verdict.value}",
            f"- Confidence: {verdict.confidence.value}",
            f"- Head SHA: `{head_sha}`",
            f"- Reviewer credential: `{token_source}`",
            "",
            f"<!-- noema-review-gate head_sha={head_sha} decision={verdict.verdict.value} -->",
        ]
    )
    return "\n".join(body)


def publish_verdict(
    repo: str,
    pr_number: int,
    verdict: ReviewVerdict,
    head_sha: str,
    *,
    token_source: str = "NOEMA_REVIEW_TOKEN",
    runner: GhRunner = default_runner,
) -> str:
    """Submit the verdict as a GitHub review and return the GitHub event used."""
    event = REVIEW_EVENT_BY_VERDICT[verdict.verdict]
    payload = {
        "commit_id": head_sha,
        "event": event,
        "body": render_review_body(verdict, head_sha, token_source),
    }
    runner(
        ["gh", "api", "-X", "POST", f"repos/{repo}/pulls/{pr_number}/reviews", "--input", "-"],
        json.dumps(payload),
    )
    return event
