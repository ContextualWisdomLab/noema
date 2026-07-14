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

from .manifest import (
    ChangedFile,
    CheckConclusion,
    DependencyFinding,
    ReviewComment,
    ReviewManifest,
    SecurityFinding,
)
from .models import ReviewVerdict, Severity, Verdict


GhRunner = Callable[[Sequence[str], str | None], str]
CodeGraphRunner = Callable[[Sequence[str], str], str]

MAX_DIFF_CHARS = 60000
MAX_CONTEXT_FILES = 12
MAX_FILE_CONTEXT_CHARS = 4000
MAX_WORKFLOW_LOG_CHARS = 30000
MAX_SARIF_CHARS = 20000
MAX_REVIEW_COMMENTS = 200
MAX_COMMENT_CHARS = 4000
MAX_CODEGRAPH_CHARS = 6000

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


def default_codegraph_runner(args: Sequence[str], source_root: str) -> str:
    """Run a CodeGraph command in the explicitly supplied source root."""
    completed = subprocess.run(
        list(args),
        cwd=source_root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        shell=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"Command failed ({completed.returncode}): {' '.join(args)}\n"
            f"{completed.stderr.strip()}"
        )
    return completed.stdout


def _truncate(text: str, limit: int) -> str:
    """Shorten text to a character budget with an explicit truncation note."""
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n[truncated {len(text) - limit} characters]"


def fetch_manifest(
    repo: str,
    pr_number: int,
    runner: GhRunner = default_runner,
    *,
    source_root: str = "",
    codegraph_runner: CodeGraphRunner = default_codegraph_runner,
) -> ReviewManifest:
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
    evidence_failures: list[str] = []

    try:
        comments = _fetch_review_comments(repo, pr_number, runner)
        if len(comments) > MAX_REVIEW_COMMENTS:
            collected = len(comments)
            comments = sorted(comments, key=lambda comment: comment.state != "open")[:MAX_REVIEW_COMMENTS]
            evidence_failures.append(
                "review context: collected "
                f"{collected} comments but the bounded manifest retains {MAX_REVIEW_COMMENTS}; "
                "manual review of the complete GitHub conversation is required"
            )
    except RuntimeError as exc:
        comments = []
        evidence_failures.append(_failure_reason("review context", exc))

    try:
        workflow_logs = _fetch_failed_workflow_logs(repo, head_sha, runner)
    except RuntimeError as exc:
        workflow_logs = f"Unavailable: {_failure_reason('workflow logs', exc)}"
        evidence_failures.append(_failure_reason("workflow logs", exc))

    try:
        security_findings = _fetch_security_findings(repo, head_sha, runner)
        sarif_summary = _render_sarif_summary(head_sha, security_findings)
    except RuntimeError as exc:
        security_findings = []
        sarif_summary = f"Unavailable: {_failure_reason('code scanning', exc)}"
        evidence_failures.append(_failure_reason("code scanning", exc))

    try:
        dependency_findings = _fetch_dependency_findings(repo, runner)
    except RuntimeError as exc:
        dependency_findings = []
        evidence_failures.append(_failure_reason("dependency alerts", exc))

    codegraph_status = _fetch_codegraph_status(source_root, codegraph_runner)
    if codegraph_status.startswith("unavailable:"):
        evidence_failures.append(codegraph_status)

    return ReviewManifest(
        repo=repo,
        pr_number=pr_number,
        title=str(pr_json.get("title") or ""),
        base_sha=str(pr_json.get("base") or ""),
        head_sha=head_sha,
        diff=_truncate(diff, MAX_DIFF_CHARS),
        diff_truncated=diff_truncated,
        changed_files=changed_files,
        workflow_logs=workflow_logs,
        sarif_summary=sarif_summary,
        dependency_findings=dependency_findings,
        security_findings=security_findings,
        check_conclusions=checks,
        review_comments=comments,
        codegraph_status=codegraph_status,
        evidence_failures=evidence_failures,
    )


def _failure_reason(label: str, exc: RuntimeError) -> str:
    """Return a bounded one-line evidence failure reason for CI logs and verdicts."""
    detail = str(exc).strip().splitlines()[0] if str(exc).strip() else "unknown error"
    return _truncate(f"{label}: {detail}", 500)


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


def _fetch_failed_workflow_logs(repo: str, head_sha: str, runner: GhRunner) -> str:
    """Fetch bounded logs for every failed current-head GitHub Actions check."""
    if not head_sha:
        return "No head SHA was available for workflow-log collection."
    raw = runner(
        [
            "gh",
            "api",
            f"repos/{repo}/commits/{head_sha}/check-runs",
            "--paginate",
            "--jq",
            (
                '.check_runs[] | select(.conclusion == "failure" or '
                '.conclusion == "cancelled" or .conclusion == "timed_out" or '
                '.conclusion == "action_required" or .conclusion == "startup_failure") '
                "| {id: .id, name: .name, conclusion: .conclusion}"
            ),
        ],
        None,
    )
    excerpts: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        node = json.loads(line)
        check_id = node.get("id")
        if not check_id:
            continue
        name = str(node.get("name") or "unnamed check")
        conclusion = str(node.get("conclusion") or "failure")
        try:
            log = runner(["gh", "api", f"repos/{repo}/actions/jobs/{check_id}/logs"], None)
        except RuntimeError as exc:
            log = f"[log unavailable: {_failure_reason(name, exc)}]"
        excerpts.append(f"## {name} ({conclusion})\n{_truncate(log, 8000)}")
    if not excerpts:
        return f"No failed GitHub Actions checks were reported for current head {head_sha}."
    return _truncate("\n\n".join(excerpts), MAX_WORKFLOW_LOG_CHARS)


def _severity_from_github(raw: str) -> Severity:
    """Normalize GitHub and Dependabot severity labels conservatively."""
    normalized = raw.strip().lower()
    mapping = {
        "critical": Severity.CRITICAL,
        "high": Severity.HIGH,
        "error": Severity.HIGH,
        "medium": Severity.MEDIUM,
        "moderate": Severity.MEDIUM,
        "warning": Severity.MEDIUM,
        "low": Severity.LOW,
        "note": Severity.LOW,
        "info": Severity.INFO,
    }
    return mapping.get(normalized, Severity.INFO)


def _fetch_security_findings(repo: str, head_sha: str, runner: GhRunner) -> list[SecurityFinding]:
    """Fetch open code-scanning alerts whose latest instance is the current head."""
    raw = runner(
        [
            "gh",
            "api",
            "--paginate",
            f"repos/{repo}/code-scanning/alerts?state=open&per_page=100",
            "--jq",
            (
                ".[] | {tool: .tool.name, identifier: .rule.id, "
                "severity: (.rule.security_severity_level // .rule.severity // \"info\"), "
                "message: .most_recent_instance.message.text, "
                "path: .most_recent_instance.location.path, "
                "line: .most_recent_instance.location.start_line, "
                "commit: .most_recent_instance.commit_sha, url: .html_url}"
            ),
        ],
        None,
    )
    findings: list[SecurityFinding] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        node = json.loads(line)
        if str(node.get("commit") or "") != head_sha:
            continue
        findings.append(
            SecurityFinding(
                tool=str(node.get("tool") or "code-scanning"),
                identifier=str(node.get("identifier") or "unknown-rule"),
                severity=_severity_from_github(str(node.get("severity") or "info")),
                message=str(node.get("message") or "No scanner message supplied."),
                path=str(node.get("path") or ""),
                line=node.get("line"),
                url=str(node.get("url") or ""),
            )
        )
    return findings


def _render_sarif_summary(head_sha: str, findings: list[SecurityFinding]) -> str:
    """Render current-head code-scanning findings into bounded SARIF-like evidence."""
    if not findings:
        return f"No open code-scanning alerts are bound to current head {head_sha}."
    lines = [
        f"[{finding.severity.value}] {finding.tool}:{finding.identifier} "
        f"{finding.path or '<no path>'}"
        + (f":{finding.line}" if finding.line else "")
        + f" - {finding.message}"
        for finding in findings
    ]
    return _truncate("\n".join(lines), MAX_SARIF_CHARS)


def _fetch_dependency_findings(repo: str, runner: GhRunner) -> list[DependencyFinding]:
    """Fetch every open Dependabot package advisory with exact version metadata."""
    raw = runner(
        [
            "gh",
            "api",
            "--paginate",
            f"repos/{repo}/dependabot/alerts?state=open&per_page=100",
            "--jq",
            (
                ".[] | {package: .dependency.package.name, "
                "installed: .security_vulnerability.vulnerable_version_range, "
                "fixed: (.security_vulnerability.first_patched_version.identifier // \"\"), "
                "severity: .security_advisory.severity, ghsa: .security_advisory.ghsa_id, "
                "cve: ([.security_advisory.identifiers[]? | "
                "select(.type == \"CVE\") | .value][0] // \"\")}"
            ),
        ],
        None,
    )
    findings: list[DependencyFinding] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        node = json.loads(line)
        identifier = str(node.get("cve") or node.get("ghsa") or "")
        findings.append(
            DependencyFinding(
                tool="dependabot",
                package_name=str(node.get("package") or "unknown-package"),
                severity=_severity_from_github(str(node.get("severity") or "info")),
                installed_version=str(node.get("installed") or ""),
                fixed_version=str(node.get("fixed") or ""),
                identifier=identifier,
            )
        )
    return findings


def _fetch_review_comments(repo: str, pr_number: int, runner: GhRunner) -> list[ReviewComment]:
    """Fetch all inline threads, review bodies, and conversation comments."""
    owner, name = repo.split("/", 1)
    query = (
        "query($owner:String!,$name:String!,$number:Int!,$endCursor:String){"
        "repository(owner:$owner,name:$name){pullRequest(number:$number){"
        "reviewThreads(first:100,after:$endCursor){nodes{isResolved comments(first:100){"
        "nodes{author{login} path line body outdated}pageInfo{hasNextPage}}}"
        "pageInfo{hasNextPage endCursor}}}}}"
    )
    thread_raw = runner(
        [
            "gh",
            "api",
            "graphql",
            "--paginate",
            "-F",
            f"owner={owner}",
            "-F",
            f"name={name}",
            "-F",
            f"number={pr_number}",
            "-f",
            f"query={query}",
            "--jq",
            (
                "if any(.data.repository.pullRequest.reviewThreads.nodes[]; "
                ".comments.pageInfo.hasNextPage) then "
                "error(\"a review thread exceeds 100 comments; complete context cannot be bounded\") "
                "else .data.repository.pullRequest.reviewThreads.nodes[] as $thread | "
                "$thread.comments.nodes[] | {author: .author.login, path: .path, line: .line, "
                "body: .body, kind: \"thread\", state: "
                "(if $thread.isResolved then \"resolved\" elif .outdated then \"outdated\" else \"open\" end)} end"
            ),
        ],
        None,
    )
    review_raw = runner(
        [
            "gh",
            "api",
            f"repos/{repo}/pulls/{pr_number}/reviews",
            "--paginate",
            "--jq",
            (
                ".[] | {author: .user.login, path: \"\", line: null, body: (.body // \"\"), "
                "kind: \"review\", state: (.state | ascii_downcase)}"
            ),
        ],
        None,
    )
    conversation_raw = runner(
        [
            "gh",
            "api",
            f"repos/{repo}/issues/{pr_number}/comments",
            "--paginate",
            "--jq",
            (
                ".[] | {author: .user.login, path: \"\", line: null, body: .body, "
                "kind: \"conversation\", state: \"open\"}"
            ),
        ],
        None,
    )
    comments: list[ReviewComment] = []
    for line in (thread_raw + "\n" + review_raw + "\n" + conversation_raw).splitlines():
        line = line.strip()
        if not line:
            continue
        node = json.loads(line)
        comments.append(
            ReviewComment(
                author=str(node.get("author") or "unknown"),
                path=str(node.get("path") or ""),
                line=node.get("line"),
                body=_truncate(str(node.get("body") or ""), MAX_COMMENT_CHARS),
                kind=str(node.get("kind") or "thread"),
                state=str(node.get("state") or "open"),
            )
        )
    return comments


def _fetch_codegraph_status(
    source_root: str,
    runner: CodeGraphRunner,
) -> str:
    """Initialize CodeGraph and return its bounded status from an explicit root."""
    if not source_root:
        return "unavailable: CodeGraph source root was not provided"
    try:
        init_output = runner(["codegraph", "init"], source_root).strip()
        status_output = runner(["codegraph", "status"], source_root).strip()
    except RuntimeError as exc:
        return f"unavailable: {_failure_reason('CodeGraph', exc)}"
    parts = [part for part in (init_output, status_output) if part]
    return _truncate("\n".join(parts) or "CodeGraph initialized; status produced no output.", MAX_CODEGRAPH_CHARS)


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
