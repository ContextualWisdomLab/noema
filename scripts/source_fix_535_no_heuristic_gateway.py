#!/usr/bin/env python3
"""One-shot TDD repair for Noema's no-heuristic orchestrator boundary.

The script is intentionally exact-text guarded: a concurrent source change makes
it fail closed rather than guessing a replacement. It never reads or prints
credential values.
"""

from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    """Replace one exact source fragment, failing closed on drift."""
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement target, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def append_once(path: str, marker: str, addition: str) -> None:
    """Append a documented contract once, preserving existing history."""
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if marker in text:
        return
    target.write_text(text.rstrip() + "\n\n" + addition.strip() + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Production reviewer: exact free-pool alias, no downstream inference budget,
# and no downstream transport retry policy. contextual-orchestrator owns those
# decisions; absent independent evidence, Noema must not invent a second router.
# ---------------------------------------------------------------------------
config_path = "reviewer/noema_reviewer/config.py"
replace_once(
    config_path,
    '''    api_key: str\n    request_timeout_seconds: float = 5400.0\n    max_retries: int = 1\n''',
    '''    api_key: str\n''',
)
replace_once(
    config_path,
    '''def _bounded_int(\n    name: str,\n    default: int,\n    minimum: int,\n    maximum: int,\n    credential_getter: CredentialGetter | None,\n) -> int:\n    """Read a bounded integer setting and fail with a non-secret reason."""\n    raw = _read(name, credential_getter)\n    if not raw:\n        return default\n    try:\n        value = int(raw)\n    except ValueError as exc:\n        raise RuntimeError(f"{name} must be an integer") from exc\n    if not minimum <= value <= maximum:\n        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")\n    return value\n\n\n''',
    "",
)
replace_once(
    config_path,
    '''def _require_single_routing_alias(name: str, value: str) -> None:\n    """Reject sequential candidate lists and direct-provider model prefixes."""\n    if any(character.isspace() for character in value) or "," in value:\n        raise RuntimeError(\n            f"{name} must be one routing alias; sequential model candidates are not allowed"\n        )\n    if value.startswith(("nvidia-nim/", "openai/", "github-models/")):\n        raise RuntimeError(\n            f"{name} must be the contextual-orchestrator routing alias, "\n            "not a direct provider model"\n        )\n''',
    '''def _require_single_routing_alias(name: str, value: str) -> None:\n    """Require the single governed free-pool alias for every Noema model call."""\n    if value != "orchestrator/free":\n        raise RuntimeError(f"{name} must equal orchestrator/free")\n''',
)
replace_once(
    config_path,
    '''    request_timeout_seconds = _bounded_int(\n        "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS", 5400, 60, 7200, credential_getter\n    )\n    max_retries = _bounded_int("NOEMA_LLM_MAX_RETRIES", 1, 0, 8, credential_getter)\n''',
    "",
)
replace_once(
    config_path,
    '''    return ReviewerConfig(\n        model_name=model_name,\n        base_url=base_url,\n        api_key=api_key,\n        request_timeout_seconds=float(request_timeout_seconds),\n        max_retries=max_retries,\n    )\n''',
    '''    return ReviewerConfig(\n        model_name=model_name,\n        base_url=base_url,\n        api_key=api_key,\n    )\n''',
)
replace_once(
    config_path,
    '''    client = AsyncOpenAI(\n        base_url=resolved.base_url,\n        api_key=resolved.api_key,\n        timeout=resolved.request_timeout_seconds,\n        max_retries=resolved.max_retries,\n    )\n''',
    '''    client = AsyncOpenAI(\n        base_url=resolved.base_url,\n        api_key=resolved.api_key,\n        timeout=None,\n        max_retries=0,\n    )\n''',
)

# Existing reviewer tests keep their security/transport coverage but use the
# actual governed alias and stop asserting the retired timeout/retry knobs.
test_config = "reviewer/tests/test_config.py"
for old, new in (
    ('"NOEMA_LLM_MODEL": "gpt-x"', '"NOEMA_LLM_MODEL": "orchestrator/free"'),
    ('model_name="gpt-x"', 'model_name="orchestrator/free"'),
    ('monkeypatch.setenv("NOEMA_LLM_MODEL", "m")', 'monkeypatch.setenv("NOEMA_LLM_MODEL", "orchestrator/free")'),
    ('assert config.model_name == "m"', 'assert config.model_name == "orchestrator/free"'),
    ('monkeypatch.setenv("NOEMA_LLM_MODEL", "env-model")', 'monkeypatch.setenv("NOEMA_LLM_MODEL", "orchestrator/free")'),
    ('assert config.model_name == "env-model"', 'assert config.model_name == "orchestrator/free"'),
):
    replace_once(test_config, old, new)

replace_once(
    test_config,
    '''def test_resolve_config_preserves_request_budget_without_sequential_fallback() -> None:\n    """Timeout and retry knobs stay on the single orchestrator-backed model."""\n    values = {\n        "NOEMA_LLM_MODEL": "orchestrator/free",\n        "NOEMA_LLM_API_URL": "https://primary.example/v1",\n        "NOEMA_LLM_API_KEY": "primary-key",\n        "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS": "5400",\n        "NOEMA_LLM_MAX_RETRIES": "4",\n    }\n    config = resolve_config(_kv(values))\n    assert config.request_timeout_seconds == 5400\n    assert config.max_retries == 4\n    model = resolve_model(config)\n    assert isinstance(model, OpenAIChatModel)\n    assert not hasattr(config, "fallback_model_name")\n\n\n''',
    '''def test_resolve_config_ignores_legacy_timeout_and_retry_inputs() -> None:\n    """Legacy numeric knobs cannot become Noema routing or compute decisions."""\n    values = {\n        "NOEMA_LLM_MODEL": "orchestrator/free",\n        "NOEMA_LLM_API_URL": "https://primary.example/v1",\n        "NOEMA_LLM_API_KEY": "primary-key",\n        "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS": "not-an-integer",\n        "NOEMA_LLM_MAX_RETRIES": "999999",\n    }\n    config = resolve_config(_kv(values))\n    assert not hasattr(config, "request_timeout_seconds")\n    assert not hasattr(config, "max_retries")\n    model = resolve_model(config)\n    assert isinstance(model, OpenAIChatModel)\n    assert not hasattr(config, "fallback_model_name")\n\n\n''',
)
replace_once(
    test_config,
    '''@pytest.mark.parametrize(\n    ("name", "value"),\n    [("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS", "59"), ("NOEMA_LLM_MAX_RETRIES", "nine")],\n)\ndef test_resolve_config_rejects_invalid_numeric_bounds(name: str, value: str) -> None:\n    """Invalid timeout and retry controls name the exact configuration error."""\n    values = {\n        "NOEMA_LLM_MODEL": "primary",\n        "NOEMA_LLM_API_URL": "https://primary.example/v1",\n        "NOEMA_LLM_API_KEY": "primary-key",\n        name: value,\n    }\n    with pytest.raises(RuntimeError, match=name):\n        resolve_config(_kv(values))\n\n\n''',
    '''@pytest.mark.parametrize(\n    "model_name",\n    ("contextual-orchestrator", "orchestrator/auto", "unreviewed-alias"),\n)\ndef test_resolve_config_rejects_every_non_free_routing_alias(model_name: str) -> None:\n    """The Python boundary independently enforces the same free-pool contract."""\n    values = {\n        "NOEMA_LLM_MODEL": model_name,\n        "NOEMA_LLM_API_URL": "https://primary.example/v1",\n        "NOEMA_LLM_API_KEY": "primary-key",\n    }\n    with pytest.raises(RuntimeError, match="NOEMA_LLM_MODEL"):\n        resolve_config(_kv(values))\n\n\n''',
)
# Valid endpoint tests used placeholder routing names; make only those fixtures
# conform to the now-exact model contract. Direct-provider negative cases stay.
text = Path(test_config).read_text(encoding="utf-8")
text = text.replace('"NOEMA_LLM_MODEL": "primary",', '"NOEMA_LLM_MODEL": "orchestrator/free",')
text = text.replace('model_name="primary",', 'model_name="orchestrator/free",')
text = text.replace('"NOEMA_LLM_MODEL": "local",', '"NOEMA_LLM_MODEL": "orchestrator/free",')
Path(test_config).write_text(text, encoding="utf-8")

# ---------------------------------------------------------------------------
# Trusted workflows: source owns the exact pool; no operational variable can
# weaken it, and Noema/OpenCode do not impose repository-authored LLM deadlines.
# ---------------------------------------------------------------------------
central = ".github/workflows/central-review.yml"
replace_once(central, "          NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}\n", "          NOEMA_LLM_MODEL: orchestrator/free\n")
replace_once(
    central,
    '''          # Dedicated inference token for contextual-orchestrator. Upstream\n          # provider credentials stay inside the orchestrator credential KV.\n          NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}\n          NOEMA_LLM_REQUEST_TIMEOUT_SECONDS: ${{ vars.NOEMA_LLM_REQUEST_TIMEOUT_SECONDS || '5400' }}\n          # One retry preserves transient recovery while keeping the request\n          # path inside the bounded publication job.\n          NOEMA_LLM_MAX_RETRIES: ${{ vars.NOEMA_LLM_MAX_RETRIES || '1' }}\n''',
    '''          # Dedicated inference token for contextual-orchestrator. Upstream\n          # provider credentials stay inside the orchestrator credential KV.\n          NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}\n''',
)
replace_once(central, "    timeout-minutes: 120\n", "")
replace_once(
    central,
    '''          printf 'Noema provider contract: gateway=contextual-orchestrator primary=%s timeout=%ss retries=%s.\\n' \\\n            "${NOEMA_LLM_MODEL:-missing}" "${NOEMA_LLM_REQUEST_TIMEOUT_SECONDS:-missing}" \\\n            "${NOEMA_LLM_MAX_RETRIES:-missing}"\n''',
    '''          printf 'Noema provider contract: gateway=contextual-orchestrator pool=%s inference_timeout=none reviewer_retry=disabled.\\n' \\\n            "${NOEMA_LLM_MODEL:-missing}"\n''',
)

hourly = ".github/workflows/hourly-product-development.yml"
replace_once(
    hourly,
    '''  # One gateway-backed session plus setup/diagnostic reserve fits in 55 minutes.\n  OPENCODE_RUN_TIMEOUT_SECONDS: "2700"\n  OPENCODE_KILL_GRACE_SECONDS: "30"\n''',
    '''  # Model inference has no repository-authored wall-clock deadline.\n  # Runner/job termination remains an external platform-capacity event.\n''',
)
replace_once(hourly, "    timeout-minutes: 55\n", "")
replace_once(hourly, "          NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}\n", "          NOEMA_LLM_MODEL: orchestrator/free\n")
replace_once(
    hourly,
    '''          if timeout --kill-after="${OPENCODE_KILL_GRACE_SECONDS}s" "${OPENCODE_RUN_TIMEOUT_SECONDS}s" \\\n            env -u GH_TOKEN -u GITHUB_TOKEN \\\n''',
    '''          if env -u GH_TOKEN -u GITHUB_TOKEN \\\n''',
)

# Retire the test helper's hand-authored timing arithmetic. Job slicing and the
# one-session structural helper remain useful and non-decision-affecting.
helper = "test/helpers/hourly-workflow.ts"
helper_text = Path(helper).read_text(encoding="utf-8")
start = helper_text.index("/** Seconds reserved for setup work")
end = helper_text.index("/**\n * Return the single OpenCode session step")
helper_text = helper_text[:start] + helper_text[end:]
Path(helper).write_text(helper_text, encoding="utf-8")

workflow_test = "test/hourly-product-development-workflow.test.ts"
replace_once(
    workflow_test,
    '''import {\n  readJobSlice,\n  readSingleOrchestratorRunStep,\n  readSingleRunBudget,\n} from "./helpers/hourly-workflow";\n''',
    '''import {\n  readJobSlice,\n  readSingleOrchestratorRunStep,\n} from "./helpers/hourly-workflow";\n''',
)
replace_once(
    workflow_test,
    '''    expect(workflow).toContain(\n      "NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}",\n    );\n''',
    '''    expect(workflow).toContain("NOEMA_LLM_MODEL: orchestrator/free");\n    expect(workflow).not.toContain("vars.NOEMA_LLM_MODEL");\n''',
)
replace_once(
    workflow_test,
    '''  it("fits one gateway-backed session, termination grace, and diagnostics inside the proposal-job budget", () => {\n    const workflow = workflowText();\n    const budget = readSingleRunBudget(workflow);\n    const runStep = readSingleOrchestratorRunStep(workflow);\n\n    expect(budget.totalSeconds).toBeLessThanOrEqual(budget.jobSeconds);\n    expect(workflow).toContain(\n      'timeout --kill-after="${OPENCODE_KILL_GRACE_SECONDS}s" "${OPENCODE_RUN_TIMEOUT_SECONDS}s"',\n    );\n    expect(runStep).toContain("opencode run \\\"$prompt\\\" --agent build");\n''',
    '''  it("runs one gateway-backed session without a repository-authored inference deadline", () => {\n    const workflow = workflowText();\n    const runStep = readSingleOrchestratorRunStep(workflow);\n\n    expect(workflow).not.toContain("OPENCODE_RUN_TIMEOUT_SECONDS");\n    expect(workflow).not.toContain("OPENCODE_KILL_GRACE_SECONDS");\n    expect(workflow).not.toContain("timeout --kill-after");\n    expect(runStep).toContain("opencode run \\\"$prompt\\\" --agent build");\n''',
)

# Reviewer operator docs must not advertise retired heuristic knobs.
reviewer_readme = "reviewer/README.md"
replace_once(
    reviewer_readme,
    '''- `NOEMA_LLM_REQUEST_TIMEOUT_SECONDS` (default `5400`, allowed `60..7200`)\n- `NOEMA_LLM_MAX_RETRIES` (default `1`, allowed `0..8`)\n''',
    '''\nNoema does not configure an inference wall-clock deadline or a local transport retry\npolicy. `contextual-orchestrator` owns routing/recovery; runner termination is external\ncapacity evidence rather than model-unavailability evidence.\n''',
)

# Correct the prior operational-boundary interpretation: workflow source owns the
# exact pool, so an Actions variable is no longer a routing authority.
doctoring = "docs/doctoring/orchestrator-free-routing-alias.md"
replace_once(
    doctoring,
    '''## Operational boundary\n\nThis is a code and documentation change only. The live GitHub Actions variable `NOEMA_LLM_MODEL`\n(`vars.NOEMA_LLM_MODEL` in `central-review.yml` and `hourly-product-development.yml`) is organization\nconfiguration, not something a source change can set. Until an org/repo administrator updates that\nvariable from `contextual-orchestrator` to `orchestrator/free`, the hardened preflight in\n`verify-orchestrator-gateway.mjs` fails closed on the old value by design — the whole point of the\nchange is that the old value is no longer accepted — so review and hourly-product-development jobs\nwill fail starting at the first run after this change merges, until that operational variable update\nis coordinated.\n''',
    '''## Operational boundary\n\nThe trusted workflow source now sets `NOEMA_LLM_MODEL: orchestrator/free` directly for central review\nand hourly product development. An organization/repository Actions variable is therefore not a model\nrouting authority and cannot weaken the free-pool contract. The gateway URL and dedicated gateway\ntoken remain deployment configuration. Noema also removes its hand-authored inference timeout and\nretry knobs: `AsyncOpenAI` is constructed with `timeout=None` and `max_retries=0`, so downstream\nreview code cannot independently classify a slow model as unavailable or invent a second retry/fallback\npolicy. contextual-orchestrator remains the sole routing/recovery owner; external runner termination is\nincomplete capacity evidence and cannot be converted into a model-quality or availability verdict.\n''',
)
append_once(
    doctoring,
    "## Research and architecture traceability — no downstream router",
    '''## Research and architecture traceability — no downstream router\n\nThe repair follows the orchestration separation already documented by the upstream product: Fugu treats\nrouting versus deeper workflows as an orchestrator policy surface; TRINITY makes coordinator roles\nexplicit; Conductor makes orchestration steps and access scopes first-class. None of those sources\njustifies a second, Noema-authored 5,400-second inference cutoff, a one-retry rule, or an operational\nmodel-alias override. With no independent evidence for those downstream decisions, the safe mechanism is\nto remove them and delegate to the governed orchestrator boundary.\n\nSakana AI. (2026). *Sakana Fugu technical report*.\nhttps://github.com/SakanaAI/fugu/blob/main/Fugu_technical_report.pdf\n\nXu, J., Sun, Q., Schwendeman, P., Nielsen, S., Cetin, E., & Tang, Y. (2025).\n*TRINITY: An evolved LLM coordinator* [Preprint]. arXiv.\nhttps://doi.org/10.48550/arXiv.2512.04695\n\nNielsen, S., Cetin, E., Schwendeman, P., Sun, Q., Xu, J., & Tang, Y. (2025).\n*Learning to orchestrate agents in natural language with the Conductor* [Preprint]. arXiv.\nhttps://doi.org/10.48550/arXiv.2512.04388''',
)

append_once(
    "docs/product-technical-gap-baseline.md",
    "## 2026-09-02 — Noema downstream inference-policy heuristic removal",
    '''## 2026-09-02 — Noema downstream inference-policy heuristic removal\n\n**Live gap / causal owner.** PR #535 correctly pins the gateway contract to `orchestrator/free`, but\nits trusted workflows still delegated the alias to `vars.NOEMA_LLM_MODEL`, while the Python reviewer\nowned a 5,400-second default inference timeout, bounded timeout range, and local retry count; hourly\nOpenCode additionally enforced a 2,700-second shell timeout plus 30-second kill grace. Those values\nchanged serving/test-time-compute behavior without a mathematical, statistical, psychometric, standards,\nor experimentally validated basis. The causal owner is Noema's gateway/workflow adapter, not a provider.\n\n**Repair.** Trusted review and product-development workflows now supply exactly `orchestrator/free`;\nNoema's Python client has no inference deadline and no local retry policy (`timeout=None`,\n`max_retries=0`), and hourly OpenCode is no longer wrapped in a repository-authored inference timeout.\ncontextual-orchestrator alone owns routing/recovery. The regression contract rejects `orchestrator/auto`,\nthe bare gateway alias, operational model overrides, downstream timeout/retry knobs, and shell-level LLM\ndeadlines. Missing independent evidence therefore fails closed by absence of a downstream policy rather\nthan by substituting another guessed constant.\n\n**Verification boundary.** The one-shot repair workflow must demonstrate the new regressions RED on the\npre-repair source, apply the exact guarded repair, run the focused TypeScript and Python suites, and\nself-remove before its commit can be treated as current-head evidence. Hosted PR checks/reviews remain\nauthoritative after that head moves.''',
)

# Changelog: replace the prior operational-variable caveat with the implemented
# source-owned boundary and record the no-heuristics correction.
changelog = "CHANGELOG.md"
changelog_text = Path(changelog).read_text(encoding="utf-8")
old_fragment = "This code change alone does NOT change production routing."
# The current entry is Korean; add a distinct audited bullet instead of relying
# on language-specific replacement.
marker = "- Noema review와 hourly-product-development의 모델 별칭을 trusted workflow source에서"
if marker not in changelog_text:
    insert = (
        "- Noema review와 hourly-product-development의 모델 별칭을 trusted workflow source에서 "
        "정확히 `orchestrator/free`로 고정하고, reviewer의 5,400초 inference timeout/로컬 retry "
        "정책과 hourly OpenCode의 2,700초+30초 shell deadline을 제거한다. 근거 없는 downstream "
        "routing/test-time-compute 규칙을 다른 상수로 대체하지 않고 contextual-orchestrator에 "
        "위임하며, 관련 회귀 테스트와 product-gap/doctoring 근거를 함께 갱신한다.\n"
    )
    changelog_text = changelog_text.replace("## Unreleased\n", "## Unreleased\n" + insert, 1)
Path(changelog).write_text(changelog_text, encoding="utf-8")

print("source-fix-535: exact guarded repair applied")
