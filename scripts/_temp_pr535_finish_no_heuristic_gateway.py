#!/usr/bin/env python3
"""One-shot exact-head repair helper for PR #535.

This file is deleted by the temporary repair workflow before publication.
"""
from __future__ import annotations

from pathlib import Path


def require_once(text: str, needle: str, label: str) -> None:
    count = text.count(needle)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}: {needle!r}")


central_path = Path(".github/workflows/central-review.yml")
central = central_path.read_text(encoding="utf-8")
marker = "  publish_review:\n"
require_once(central, marker, "central publish marker")
prefix, publication = central.split(marker, 1)

# The evidence collection/attestation jobs keep their operational time budgets;
# only model execution in publication delegates inference lifecycle to the gateway.
if "    timeout-minutes: 120\n" in publication:
    publication = publication.replace("    timeout-minutes: 120\n", "", 1)

model_var = "          NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}\n"
model_pin = "          NOEMA_LLM_MODEL: orchestrator/free\n"
if model_var in publication:
    require_once(publication, model_var, "publication model authority")
    publication = publication.replace(model_var, model_pin, 1)
elif publication.count(model_pin) != 1:
    raise SystemExit("central publication has neither one mutable model variable nor one canonical free-pool pin")

stale_lines = {
    "          NOEMA_LLM_REQUEST_TIMEOUT_SECONDS: ${{ vars.NOEMA_LLM_REQUEST_TIMEOUT_SECONDS || '5400' }}",
    "          NOEMA_LLM_MAX_RETRIES: ${{ vars.NOEMA_LLM_MAX_RETRIES || '1' }}",
    "          # One retry preserves transient recovery while keeping the request",
    "          # path inside the bounded publication job.",
}
lines = publication.splitlines()
new_lines: list[str] = []
i = 0
while i < len(lines):
    line = lines[i]
    if line in stale_lines:
        i += 1
        continue
    if "printf 'Noema provider contract: gateway=contextual-orchestrator primary=%s timeout=%ss retries=%s." in line:
        new_lines.append("          printf 'Noema provider contract: gateway=contextual-orchestrator primary=%s.\\n' \\")
        new_lines.append('            "${NOEMA_LLM_MODEL:-missing}"')
        i += 1
        while i < len(lines) and "set +e" not in lines[i]:
            i += 1
        continue
    new_lines.append(line)
    i += 1
publication = "\n".join(new_lines) + "\n"
for forbidden in (
    "vars.NOEMA_LLM_MODEL",
    "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS",
    "NOEMA_LLM_MAX_RETRIES",
    "timeout-minutes: 120",
):
    if forbidden in publication:
        raise SystemExit(f"central publication still contains downstream decision input: {forbidden}")
central_path.write_text(prefix + marker + publication, encoding="utf-8")

# A concurrent compatible writer already repaired the hourly production path.
# Validate it rather than overwriting concurrent work.
hourly = Path(".github/workflows/hourly-product-development.yml").read_text(encoding="utf-8")
for forbidden in (
    "OPENCODE_RUN_TIMEOUT_SECONDS",
    "OPENCODE_KILL_GRACE_SECONDS",
    "timeout --kill-after",
    "NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}",
):
    if forbidden in hourly:
        raise SystemExit(f"hourly production path still contains downstream decision input: {forbidden}")
if "NOEMA_LLM_MODEL: orchestrator/free" not in hourly:
    raise SystemExit("hourly production path is not pinned to orchestrator/free")

prereq_path = Path("docs/operations/hourly-product-development-prerequisites.md")
prereq = prereq_path.read_text(encoding="utf-8")
prereq = prereq.replace(
    "- `NOEMA_LLM_MODEL`: 정규 라우팅 별칭 `orchestrator/free`(실패-폐쇄 zero-cost pool, ZDR-first)\n",
    "- 모델 라우팅은 workflow source가 `orchestrator/free`로 고정하며 별도 Actions variable을 요구하지 않음\n",
)
prereq = prereq.replace(
    "4. 리뷰와 동일한 `NOEMA_LLM_API_URL`, `NOEMA_LLM_MODEL`, `NOEMA_LLM_API_KEY`를 설정합니다.\n",
    "4. 리뷰와 동일한 `NOEMA_LLM_API_URL`, `NOEMA_LLM_API_KEY`를 설정하고 모델은 source-pinned `orchestrator/free`인지 확인합니다.\n",
)
prereq_path.write_text(prereq, encoding="utf-8")

baseline_path = Path("docs/product-technical-gap-baseline.md")
baseline = baseline_path.read_text(encoding="utf-8")
heading = "## 2026-09-02 — Noema review compute authority hardening"
if heading not in baseline:
    baseline = baseline.rstrip() + "\n\n" + f"""{heading}

A live PR-head audit found that the free-pool validator and no-retry reviewer implementation coexisted with stale workflow-owned decision inputs: central review still sourced `NOEMA_LLM_MODEL` plus numeric timeout/retry knobs from Actions variables, and hourly OpenCode still imposed a repository-authored inference deadline. The executable `test/no-heuristic-gateway-workflow.test.ts` was RED against those production workflows, so the regression was treated as an instruction to complete GREEN rather than as a stopping point.

Central review and hourly OpenCode now source-pin `orchestrator/free`; operational variables can no longer widen routing authority. The Python reviewer keeps `AsyncOpenAI(timeout=None, max_retries=0)`, while contextual-orchestrator owns inference lifecycle and recovery. The hourly proposal session likewise no longer applies a downstream wall-clock kill to model execution. GitHub runner/platform capacity remains external to model-routing policy.

Temporary source-fix workflows and helpers are non-production machinery and are removed before the publishable successor head. Successor-head checks must be created by a workflow-starting repository-scoped credential rather than a workflow-local `github.token` push.
"""
baseline_path.write_text(baseline, encoding="utf-8")
