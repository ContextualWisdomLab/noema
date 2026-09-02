"""Apply Noema's exact no-heuristics orchestrator/free and review-policy repair."""

from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact match, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def append_once(path: str, section: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if section.strip() in text:
        return
    target.write_text(text.rstrip() + "\n\n" + section.strip() + "\n", encoding="utf-8")


CONFIG = '''"""Reviewer model/credential resolution for the exact orchestrator/free pool.

Secrets are resolved from the credential registry with environment variables as
bootstrap transport only. Noema does not allocate provider retries, wall-clock
model attempt budgets, candidate fallbacks, or a second routing policy. Those
choices belong to ContextualWisdomLab/contextual-orchestrator. Private-target
privacy is a trusted workflow-derived boolean and is forwarded as request-level
``zdr_only`` evidence rather than inferred from model/provider names.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

from pydantic_ai.models import Model


CredentialGetter = Callable[[str], str | None]
_LOOPBACK_MODEL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_FREE_ROUTING_ALIAS = "orchestrator/free"
_LEGACY_ATTEMPT_CONTROLS = (
    "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS",
    "NOEMA_LLM_MAX_RETRIES",
)


@dataclass(frozen=True)
class ReviewerConfig:
    """Resolved settings for one production review request."""

    model_name: str
    base_url: str
    api_key: str
    zdr_only: bool = False


def _read(name: str, credential_getter: CredentialGetter | None) -> str:
    """Read a setting from the KV credential getter, falling back to env transport."""
    if credential_getter is not None:
        value = credential_getter(name)
        if value:
            return value.strip()
    return (os.environ.get(name) or "").strip()


def _read_zdr_policy(credential_getter: CredentialGetter | None) -> bool:
    """Parse the trusted workflow-derived request privacy policy exactly."""
    raw = _read("NOEMA_LLM_ZDR_ONLY", credential_getter)
    if raw in ("", "false"):
        return False
    if raw == "true":
        return True
    raise RuntimeError("NOEMA_LLM_ZDR_ONLY must be exactly true or false")


def _reject_legacy_attempt_controls(credential_getter: CredentialGetter | None) -> None:
    """Fail closed if Noema-local model timeout/retry allocation is reintroduced."""
    configured = [name for name in _LEGACY_ATTEMPT_CONTROLS if _read(name, credential_getter)]
    if configured:
        raise RuntimeError(
            ", ".join(configured)
            + " is not allowed; model attempt allocation belongs to contextual-orchestrator"
        )


def _require_single_routing_alias(name: str, value: str) -> None:
    """Require the exact governed free-pool alias and reject local routing choices."""
    if value != _FREE_ROUTING_ALIAS:
        raise RuntimeError(f"{name} must equal {_FREE_ROUTING_ALIAS}")


def _require_safe_model_endpoint(name: str, value: str) -> None:
    """Reject credential-bearing model endpoints that use unsafe remote transport."""
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a valid model endpoint URL") from exc
    if hostname and parsed.scheme == "https":
        return
    if parsed.scheme == "http" and hostname in _LOOPBACK_MODEL_HOSTS:
        return
    raise RuntimeError(f"{name} must use HTTPS except for a loopback development endpoint")


def resolve_config(credential_getter: CredentialGetter | None = None) -> ReviewerConfig:
    """Resolve the exact free-pool reviewer configuration and fail closed on drift."""
    model_name = _read("NOEMA_LLM_MODEL", credential_getter)
    base_url = _read("NOEMA_LLM_API_URL", credential_getter)
    api_key = _read("NOEMA_LLM_API_KEY", credential_getter)
    _reject_legacy_attempt_controls(credential_getter)
    zdr_only = _read_zdr_policy(credential_getter)
    leftover_fallback = [
        name
        for name in (
            "NOEMA_FALLBACK_LLM_MODEL",
            "NOEMA_FALLBACK_LLM_API_URL",
            "NOEMA_FALLBACK_LLM_API_KEY",
        )
        if _read(name, credential_getter)
    ]
    missing = [
        name
        for name, value in (
            ("NOEMA_LLM_MODEL", model_name),
            ("NOEMA_LLM_API_URL", base_url),
            ("NOEMA_LLM_API_KEY", api_key),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Noema reviewer is unconfigured; missing " + ", ".join(missing) + ". "
            "Provide them through the credential registry (KV) or the CI secret "
            "transport before running a review."
        )
    if leftover_fallback:
        raise RuntimeError(
            "Noema sequential model fallback is not allowed; unset "
            + ", ".join(leftover_fallback)
            + ". contextual-orchestrator owns routing."
        )
    _require_single_routing_alias("NOEMA_LLM_MODEL", model_name)
    _require_safe_model_endpoint("NOEMA_LLM_API_URL", base_url)
    return ReviewerConfig(
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
        zdr_only=zdr_only,
    )


def resolve_model(config: ReviewerConfig | None = None) -> Model:
    """Build one OpenAI-compatible gateway model with no Noema-local retries/time budget."""
    from openai import AsyncOpenAI
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    resolved = config or resolve_config()
    _require_single_routing_alias("NOEMA_LLM_MODEL", resolved.model_name)
    _require_safe_model_endpoint("NOEMA_LLM_API_URL", resolved.base_url)

    client = AsyncOpenAI(
        base_url=resolved.base_url,
        api_key=resolved.api_key,
        timeout=None,
        max_retries=0,
    )
    return OpenAIChatModel(
        resolved.model_name,
        provider=OpenAIProvider(openai_client=client),
    )
'''
Path("reviewer/noema_reviewer/config.py").write_text(CONFIG, encoding="utf-8")

MODELS = '''"""Structured review-verdict schema for the Noema second reviewer."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class Verdict(str, Enum):
    """The three terminal review outcomes the reviewer can publish."""

    APPROVE = "approve"
    REQUEST_CHANGES = "request_changes"
    BLOCKED = "blocked"


class Severity(str, Enum):
    """Scanner/reviewer severity metadata, never a local admission cutoff."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Finding(BaseModel):
    """A single reviewer-facing issue tied to concrete evidence."""

    severity: Severity = Field(description="Source-provided severity metadata.")
    path: str = Field(description="Repository-relative path the issue lives in.")
    line: int | None = Field(default=None, description="1-indexed line when known.")
    evidence: str = Field(description="Evidence proving the issue is real.")
    recommendation: str = Field(description="The specific remediation to apply.")


class ReviewVerdict(BaseModel):
    """The complete, publishable verdict returned by a review driver."""

    verdict: Verdict = Field(description="The terminal outcome of the review.")
    summary: str = Field(description="Short reviewer-facing summary.")
    findings: list[Finding] = Field(default_factory=list)
    suggested_patch_ref: str | None = Field(default=None)
    blocked_reasons: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_approval_invariants(self) -> "ReviewVerdict":
        """Reject approval states that retain any unresolved finding or evidence gap."""
        if self.verdict is not Verdict.APPROVE:
            return self
        if self.blocked_reasons:
            raise ValueError("approval verdict cannot contain blocked reasons")
        if self.findings:
            raise ValueError("approval verdict cannot contain findings")
        return self

    def is_approval(self) -> bool:
        """Return whether this verdict approves the pull request."""
        return self.verdict is Verdict.APPROVE
'''
Path("reviewer/noema_reviewer/models.py").write_text(MODELS, encoding="utf-8")

GATING = '''"""Fail-closed evidence gates applied around the LLM review.

Severity remains source metadata. Noema does not invent a severity threshold:
any unresolved current-head dependency, scanner, check, or review-thread finding
prevents approval. Missing strict-mode evidence remains a blocked outcome.
"""

from __future__ import annotations

from .manifest import ReviewManifest
from .models import Finding, ReviewVerdict, Severity, Verdict


REVIEW_DEPENDENT_CHECK_NAMES = frozenset({"opencode-review", "metadata-only gate evaluation"})


def missing_evidence(manifest: ReviewManifest) -> list[str]:
    """Return human-readable reasons the manifest lacks review-grade evidence."""
    reasons: list[str] = []
    if not manifest.diff.strip():
        reasons.append("missing pull request diff")
    elif manifest.diff_truncated:
        reasons.append("pull request diff was truncated")
    if not manifest.changed_files:
        reasons.append("missing changed-file context")
    if not manifest.check_conclusions:
        reasons.append("missing current GitHub check conclusions")
    codegraph_status = manifest.codegraph_status.strip()
    if not codegraph_status:
        reasons.append("missing CodeGraph evidence")
    elif codegraph_status.lower().startswith("unavailable"):
        reasons.append(manifest.codegraph_status)
    reasons.extend(f"evidence collection failure: {failure}" for failure in manifest.evidence_failures)
    return reasons


def blocked_verdict(reasons: list[str]) -> ReviewVerdict:
    """Build a blocked verdict that names every missing input."""
    return ReviewVerdict(
        verdict=Verdict.BLOCKED,
        summary="Noema could not reach a decision because required review evidence was missing; see blocked_reasons.",
        blocked_reasons=reasons,
    )


def dependency_findings_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert every unresolved dependency finding into a review finding."""
    findings: list[Finding] = []
    for dependency in manifest.dependency_findings:
        if dependency.resolved:
            continue
        fixed = dependency.fixed_version or "a non-vulnerable release"
        identifier = f" ({dependency.identifier})" if dependency.identifier else ""
        findings.append(
            Finding(
                severity=dependency.severity,
                path=dependency.package_name,
                evidence=(
                    f"{dependency.tool} reported {dependency.package_name}"
                    f"@{dependency.installed_version or 'current'}{identifier}"
                ),
                recommendation=f"Bump {dependency.package_name} to {fixed} and refresh the lockfile.",
            )
        )
    return findings


def security_findings_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert every current-head scanner finding into a review finding."""
    return [
        Finding(
            severity=security.severity,
            path=security.path or ".github/code-scanning",
            line=security.line,
            evidence=(
                f"{security.tool} reported {security.identifier}: {security.message}"
                + (f" ({security.url})" if security.url else "")
            ),
            recommendation="Remediate the current-head scanner finding and rerun code scanning.",
        )
        for security in manifest.security_findings
    ]


def failed_checks_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert every observed non-success current-head check into a review finding."""
    return [
        Finding(
            severity=Severity.HIGH,
            path=f".github/checks/{check.name}",
            evidence=f"Current-head check concluded {check.conclusion}; see bounded workflow_logs.",
            recommendation="Require terminal success for the current-head check before approval.",
        )
        for check in manifest.check_conclusions
        if check.name not in REVIEW_DEPENDENT_CHECK_NAMES and check.conclusion.lower() != "success"
    ]


def unresolved_threads_as_review(manifest: ReviewManifest) -> list[Finding]:
    """Convert unresolved, non-outdated inline threads into review findings."""
    return [
        Finding(
            severity=Severity.HIGH,
            path=comment.path or ".github/review-threads",
            line=comment.line,
            evidence=f"Unresolved review thread by {comment.author}: {comment.body}",
            recommendation="Resolve the cited review thread with a current-head fix or response.",
        )
        for comment in manifest.review_comments
        if comment.kind == "thread" and comment.state == "open"
    ]


def _enforce_findings(verdict: ReviewVerdict, findings: list[Finding], summary_prefix: str) -> ReviewVerdict:
    """Merge deterministic findings and prevent an approval from hiding them."""
    if not findings or verdict.verdict is Verdict.BLOCKED:
        return verdict
    existing = {(finding.severity, finding.path) for finding in verdict.findings}
    merged = list(verdict.findings)
    for finding in findings:
        if (finding.severity, finding.path) not in existing:
            merged.append(finding)
    summary = verdict.summary
    if verdict.verdict is Verdict.APPROVE:
        summary = summary_prefix + summary
    return verdict.model_copy(update={"verdict": Verdict.REQUEST_CHANGES, "findings": merged, "summary": summary})


def enforce_security_and_check_gates(manifest: ReviewManifest, verdict: ReviewVerdict) -> ReviewVerdict:
    """Prevent approval while any current-head check/scanner/thread finding remains."""
    deterministic = failed_checks_as_review(manifest) + security_findings_as_review(manifest) + unresolved_threads_as_review(manifest)
    return _enforce_findings(
        verdict,
        deterministic,
        "Downgraded to request_changes: current-head checks, scanner findings, or unresolved threads require remediation. ",
    )


def enforce_dependency_gate(manifest: ReviewManifest, verdict: ReviewVerdict) -> ReviewVerdict:
    """Prevent approval while any unresolved dependency finding remains."""
    return _enforce_findings(
        verdict,
        dependency_findings_as_review(manifest),
        "Downgraded to request_changes: unresolved dependency finding(s) require remediation. ",
    )


def apply_gates(manifest: ReviewManifest, verdict: ReviewVerdict, *, strict: bool) -> ReviewVerdict:
    """Apply fail-closed evidence, scanner/check/thread, and dependency gates."""
    if strict:
        reasons = missing_evidence(manifest)
        if reasons:
            return blocked_verdict(reasons)
    return enforce_dependency_gate(manifest, enforce_security_and_check_gates(manifest, verdict))
'''
Path("reviewer/noema_reviewer/gating.py").write_text(GATING, encoding="utf-8")

replace_once(
    "reviewer/noema_reviewer/agent.py",
    '    "regressions from that evidence only. Approve when no blocking issue is "\n    "supported by the evidence. Use request_changes only for concrete, "',
    '    "regressions from that evidence only. Approve only when no unresolved finding is "\n    "supported by the evidence. Use request_changes only for concrete, "',
)
replace_once(
    "reviewer/noema_reviewer/agent.py",
    '    "than guessing. Never approve while an unresolved MEDIUM-or-higher "\n    "dependency finding is present; require a package bump instead."',
    '    "than guessing. Never approve while any unresolved dependency or scanner "\n    "finding is present; require remediation evidence instead."',
)
replace_once(
    "reviewer/noema_reviewer/agent.py",
    '    def __init__(self, model: Model | str) -> None:\n        """Build the agent around an injected model (a real model or a test model)."""\n        self._agent: Agent[None, ReviewVerdict] = Agent(\n            model,\n            output_type=ReviewVerdict,\n            system_prompt=SYSTEM_PROMPT,\n            retries=3,\n        )',
    '    def __init__(self, model: Model | str, *, zdr_only: bool = False) -> None:\n        """Build the agent without local retries and with exact request privacy policy."""\n        model_settings = {"extra_body": {"zdr_only": True}} if zdr_only else None\n        self._agent: Agent[None, ReviewVerdict] = Agent(\n            model,\n            output_type=ReviewVerdict,\n            system_prompt=SYSTEM_PROMPT,\n            retries=0,\n            model_settings=model_settings,\n        )',
)
replace_once(
    "reviewer/noema_reviewer/agent.py",
    '    model = resolve_model(config)\n    return PydanticAIReviewAgent(model)',
    '    from .config import resolve_config\n\n    resolved = config or resolve_config()\n    model = resolve_model(resolved)\n    return PydanticAIReviewAgent(model, zdr_only=resolved.zdr_only)',
)

replace_once(
    "reviewer/noema_reviewer/__init__.py",
    "from .models import Confidence, Finding, ReviewVerdict, Severity, Verdict",
    "from .models import Finding, ReviewVerdict, Severity, Verdict",
)
replace_once("reviewer/noema_reviewer/__init__.py", '    "Confidence",\n', "")

replace_once(
    "reviewer/noema_reviewer/github_io.py",
    '            f"- Confidence: {verdict.confidence.value}",\n',
    "",
)

replace_once(
    "scripts/lib/orchestrator-gateway.mjs",
    'const DEFAULT_ROUTING_ALIAS = "contextual-orchestrator";\nconst HEALTH_TIMEOUT_MS = 15_000;\n',
    'const DEFAULT_ROUTING_ALIAS = "orchestrator/free";\n',
)
replace_once(
    "scripts/lib/orchestrator-gateway.mjs",
    '  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;\n  if (typeof fetchImpl !== "function") {',
    '  const timeoutMs = options.timeoutMs;\n  if (typeof fetchImpl !== "function") {',
)
replace_once(
    "scripts/lib/orchestrator-gateway.mjs",
    '  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), timeoutMs);\n  if (timeoutMs <= 0) {\n    controller.abort();\n  }\n  const timeoutPromise = new Promise((_, reject) => {\n    const onAbort = () => {\n      reject(new Error("contextual-orchestrator health request timed out"));\n    };\n    if (controller.signal.aborted) {\n      onAbort();\n      return;\n    }\n    controller.signal.addEventListener("abort", onAbort, { once: true });\n  });',
    '  const controller = new AbortController();\n  const timer = timeoutMs == null ? undefined : setTimeout(() => controller.abort(), timeoutMs);\n  if (timeoutMs != null && timeoutMs <= 0) {\n    controller.abort();\n  }\n  const timeoutPromise = new Promise((_, reject) => {\n    if (timeoutMs == null) return;\n    const onAbort = () => {\n      reject(new Error("contextual-orchestrator health request timed out"));\n    };\n    if (controller.signal.aborted) {\n      onAbort();\n      return;\n    }\n    controller.signal.addEventListener("abort", onAbort, { once: true });\n  });',
)

CENTRAL = ".github/workflows/central-review.yml"
replace_once(
    CENTRAL,
    "    runs-on: ubuntu-latest\n    timeout-minutes: 120\n    permissions:\n      contents: read\n",
    "    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n",
)
replace_once(CENTRAL, "          NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}", "          NOEMA_LLM_MODEL: orchestrator/free")
replace_once(
    CENTRAL,
    "          NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}\n          NOEMA_LLM_REQUEST_TIMEOUT_SECONDS: ${{ vars.NOEMA_LLM_REQUEST_TIMEOUT_SECONDS || '5400' }}\n          # One retry preserves transient recovery while keeping the request\n          # path inside the bounded publication job.\n          NOEMA_LLM_MAX_RETRIES: ${{ vars.NOEMA_LLM_MAX_RETRIES || '1' }}",
    "          NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}",
)
replace_once(
    CENTRAL,
    "          printf 'Noema provider contract: gateway=contextual-orchestrator primary=%s timeout=%ss retries=%s.\\n' \\\n            \"${NOEMA_LLM_MODEL:-missing}\" \"${NOEMA_LLM_REQUEST_TIMEOUT_SECONDS:-missing}\" \\\n            \"${NOEMA_LLM_MAX_RETRIES:-missing}\"",
    "          printf 'Noema provider contract: gateway=contextual-orchestrator pool=%s zdr_only=%s.\\n' \\\n            \"${NOEMA_LLM_MODEL:-missing}\" \"${NOEMA_LLM_ZDR_ONLY:-missing}\"",
)
replace_once(CENTRAL, "            jq '{verdict,summary,findings,blocked_reasons,confidence}' \\\n", "            jq '{verdict,summary,findings,blocked_reasons}' \\\n")
replace_once(CENTRAL, "            --severity MEDIUM,HIGH,CRITICAL \\\n", "")
replace_once(
    CENTRAL,
    "          printf 'Verified manifest provenance and binding for %s#%s head=%s.\\n' \\\n            \"$manifest_repo\" \"$manifest_pr\" \"$manifest_head\"\n\n      - name: Set up Python",
    "          printf 'Verified manifest provenance and binding for %s#%s head=%s.\\n' \\\n            \"$manifest_repo\" \"$manifest_pr\" \"$manifest_head\"\n\n      - name: Derive private-target ZDR from live repository visibility\n        env:\n          GH_TOKEN: ${{ steps.noema_write_app.outputs.token }}\n        run: |\n          set -euo pipefail\n          visibility=\"$(gh api \"repos/${TARGET_REPOSITORY}\" --jq .visibility)\"\n          case \"$visibility\" in\n            public) zdr_only=false ;;\n            private|internal) zdr_only=true ;;\n            *) echo \"::error::Noema could not establish target repository visibility; refusing model execution.\"; exit 1 ;;\n          esac\n          echo \"NOEMA_LLM_ZDR_ONLY=$zdr_only\" >>\"$GITHUB_ENV\"\n          printf 'Noema request privacy: visibility=%s zdr_only=%s.\\n' \"$visibility\" \"$zdr_only\"\n\n      - name: Set up Python",
)

HOURLY = ".github/workflows/hourly-product-development.yml"
replace_once(
    HOURLY,
    '  # One gateway-backed session plus setup/diagnostic reserve fits in 55 minutes.\n  OPENCODE_RUN_TIMEOUT_SECONDS: "2700"\n  OPENCODE_KILL_GRACE_SECONDS: "30"\n',
    "",
)
replace_once(
    HOURLY,
    "    runs-on: ubuntu-latest\n    timeout-minutes: 55\n    permissions:\n",
    "    runs-on: ubuntu-latest\n    permissions:\n",
)
replace_once(HOURLY, "          NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}", "          NOEMA_LLM_MODEL: orchestrator/free")
replace_once(
    HOURLY,
    '          if timeout --kill-after="${OPENCODE_KILL_GRACE_SECONDS}s" "${OPENCODE_RUN_TIMEOUT_SECONDS}s" \\\n            env -u GH_TOKEN -u GITHUB_TOKEN \\\n',
    '          if env -u GH_TOKEN -u GITHUB_TOKEN \\\n',
)
replace_once(
    HOURLY,
    "      - name: Verify contextual-orchestrator gateway and write OpenCode config\n        if: steps.gate.outputs.dispatch == 'true' && env.DRY_RUN != 'true'\n        shell: bash\n        env:\n          NOEMA_LLM_API_URL: ${{ vars.NOEMA_LLM_API_URL }}\n          NOEMA_LLM_MODEL: orchestrator/free",
    "      - name: Derive repository ZDR policy and fail closed when OpenCode cannot attest it\n        if: steps.gate.outputs.dispatch == 'true' && env.DRY_RUN != 'true'\n        shell: bash\n        env:\n          GH_TOKEN: ${{ github.token }}\n        run: |\n          set -euo pipefail\n          visibility=\"$(gh api \"repos/${GITHUB_REPOSITORY}\" --jq .visibility)\"\n          case \"$visibility\" in\n            public) zdr_only=false ;;\n            private|internal) zdr_only=true ;;\n            *) echo \"::error::Noema could not establish repository visibility; refusing model execution.\"; exit 1 ;;\n          esac\n          echo \"NOEMA_LLM_ZDR_ONLY=$zdr_only\" >>\"$GITHUB_ENV\"\n          if [ \"$zdr_only\" = true ]; then\n            echo \"::error::The OpenCode gateway transport cannot yet prove request-level zdr_only; private-repository inference fails closed.\"\n            exit 1\n          fi\n\n      - name: Verify contextual-orchestrator gateway and write OpenCode config\n        if: steps.gate.outputs.dispatch == 'true' && env.DRY_RUN != 'true'\n        shell: bash\n        env:\n          NOEMA_LLM_API_URL: ${{ vars.NOEMA_LLM_API_URL }}\n          NOEMA_LLM_MODEL: orchestrator/free",
)

for path, substitutions in {
    "AGENTS.md": [
        ("`NOEMA_LLM_MODEL` is normally the routing alias `contextual-orchestrator`", "`NOEMA_LLM_MODEL` is exactly the governed pool `orchestrator/free`"),
    ],
    "README.md": [
        ("Routing alias, normally `contextual-orchestrator`", "Routing pool, exactly `orchestrator/free`"),
    ],
    "docs/orchestrator-gateway-consumer-contract.md": [
        ("Production default is `contextual-orchestrator`.", "Production value is exactly `orchestrator/free`."),
    ],
    "reviewer/README.md": [
        ("- `NOEMA_LLM_REQUEST_TIMEOUT_SECONDS` (default `5400`, allowed `60..7200`)\n- `NOEMA_LLM_MAX_RETRIES` (default `1`, allowed `0..8`)\n", "- `NOEMA_LLM_ZDR_ONLY` (`true` only when derived from live private/internal repository visibility)\n"),
    ],
}.items():
    for old, new in substitutions:
        replace_once(path, old, new)

append_once(
    "docs/adr/0002-work-conserving-autonomy.md",
    '''## 2026-09-02 no-heuristics routing and privacy amendment

Noema no longer chooses a generic orchestrator alias, model timeout, retry count,
severity cutoff, or categorical confidence estimate. Every GitHub Actions LLM
path requests exactly `orchestrator/free`. The review workflow derives repository
visibility from GitHub's repository API; private/internal targets set request-level
`zdr_only=true`. The OpenCode consumer currently has no reviewed mechanism for
injecting that request field, so a private/internal hourly-development run fails
closed before inference rather than silently bypassing ZDR. Pydantic AI's
OpenAI-compatible model settings forward `extra_body` to the provider request, so
the reviewer can carry the orchestrator's documented `zdr_only` field without a
provider-specific route list. Missing or malformed visibility also fails closed.

Scanner severity remains provenance metadata and no longer decides admission:
any unresolved current-head scanner or dependency finding prevents approval.
The previous `high|medium|low` confidence field is removed because no calibration
model identified those categories.

### References

GitHub. (2026). *REST API endpoints for repositories*. GitHub Docs. https://docs.github.com/en/rest/repos/repos

Pydantic Services Inc. (2026). *OpenAI models*. Pydantic AI documentation. https://pydantic.dev/docs/ai/models/openai/

ContextualWisdomLab. (2026). *contextual-orchestrator API contract and ADR 0032: model-group cost-aware discovery*. ContextualWisdomLab/contextual-orchestrator.
''',
)
append_once(
    "docs/product-technical-gap-baseline.md",
    '''## Live repair — 2026-09-02 no-heuristics LLM execution boundary

Fresh protected-main RCA found four decision authorities outside contextual-orchestrator:
Noema accepted a generic model alias instead of exact `orchestrator/free`; central review
and hourly OpenCode imposed repository-authored wall-clock/retry budgets; private-target
requests did not carry a non-bypassable ZDR policy; and review admission used a local
MEDIUM severity cutoff plus an uncalibrated categorical confidence field. The canonical
repair removes those local model-attempt controls, pins the exact free pool, derives
private/internal visibility from GitHub metadata, sends reviewer `zdr_only=true`, fails
closed for private OpenCode until its transport can prove the same field, blocks approval
on every unresolved scanner/dependency finding independent of severity label, and removes
the unsupported confidence estimate. RED contracts precede the behavior change; hosted
exact-head checks remain authoritative before merge.
''',
)
append_once(
    "CHANGELOG.md",
    '''- Noema LLM execution now pins `orchestrator/free`, removes repository-authored model timeout/retry allocation and categorical confidence, derives private-target ZDR from live repository visibility, and treats every unresolved scanner/dependency finding as blocking evidence rather than applying a local severity cutoff.''',
)
