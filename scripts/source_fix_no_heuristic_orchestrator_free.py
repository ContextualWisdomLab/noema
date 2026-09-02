"""Finish Noema's no-heuristics orchestrator/free repair from the current writer head."""

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


# The reviewer Python core was repaired directly on the canonical writer branch
# before this one-shot resumed. Fail closed if that causal state is absent.
required_markers = {
    "reviewer/noema_reviewer/config.py": (
        '_FREE_ROUTING_ALIAS = "orchestrator/free"',
        "timeout=None",
        "max_retries=0",
        "NOEMA_LLM_ZDR_ONLY",
    ),
    "reviewer/noema_reviewer/models.py": (
        "approval verdict cannot contain findings",
        "class ReviewVerdict",
    ),
    "reviewer/noema_reviewer/gating.py": (
        "Convert every current-head scanner finding into a review finding",
        "Convert every unresolved dependency finding into a review finding",
    ),
    "reviewer/noema_reviewer/agent.py": (
        "retries=0",
        'model_settings = {"extra_body": {"zdr_only": True}} if zdr_only else None',
    ),
}
for path, markers in required_markers.items():
    text = Path(path).read_text(encoding="utf-8")
    missing = [marker for marker in markers if marker not in text]
    if missing:
        raise SystemExit(f"{path}: prerequisite reviewer repair missing markers: {missing}")

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
replace_once(
    CENTRAL,
    "          NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}",
    "          NOEMA_LLM_MODEL: orchestrator/free",
)
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
replace_once(
    CENTRAL,
    "            jq '{verdict,summary,findings,blocked_reasons,confidence}' \\\n",
    "            jq '{verdict,summary,findings,blocked_reasons}' \\\n",
)
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
replace_once(
    HOURLY,
    "          NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}",
    "          NOEMA_LLM_MODEL: orchestrator/free",
)
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
        (
            "`NOEMA_LLM_MODEL` is normally the routing alias `contextual-orchestrator`",
            "`NOEMA_LLM_MODEL` is exactly the governed pool `orchestrator/free`",
        ),
    ],
    "README.md": [
        (
            "Routing alias, normally `contextual-orchestrator`",
            "Routing pool, exactly `orchestrator/free`",
        ),
    ],
    "docs/orchestrator-gateway-consumer-contract.md": [
        (
            "Production default is `contextual-orchestrator`.",
            "Production value is exactly `orchestrator/free`.",
        ),
    ],
    "reviewer/README.md": [
        (
            "- `NOEMA_LLM_REQUEST_TIMEOUT_SECONDS` (default `5400`, allowed `60..7200`)\n- `NOEMA_LLM_MAX_RETRIES` (default `1`, allowed `0..8`)\n",
            "- `NOEMA_LLM_ZDR_ONLY` (`true` only when derived from live private/internal repository visibility)\n",
        ),
    ],
}.items():
    for old, new in substitutions:
        replace_once(path, old, new)

append_once(
    "docs/adr/0002-work-conserving-autonomy.md",
    """## 2026-09-02 no-heuristics routing and privacy amendment

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
""",
)
append_once(
    "docs/product-technical-gap-baseline.md",
    """## Live repair — 2026-09-02 no-heuristics LLM execution boundary

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
""",
)
append_once(
    "CHANGELOG.md",
    """- Noema LLM execution now pins `orchestrator/free`, removes repository-authored model timeout/retry allocation and categorical confidence, derives private-target ZDR from live repository visibility, and treats every unresolved scanner/dependency finding as blocking evidence rather than applying a local severity cutoff.""",
)
