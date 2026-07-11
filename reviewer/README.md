# Noema reviewer (PydanticAI second reviewer)

This is the reviewer **agent** plane described in
[`docs/noema-agent-sandbox-plan.md`](../docs/noema-agent-sandbox-plan.md)
(ContextualWisdomLab/noema#9). It is an independent second reviewer that runs
alongside OpenCode so the organization's two-reviewer merge rule is satisfied by
two genuinely independent judgements, not by weakening the rule.

Division of responsibility:

- **Noema Cloudflare Worker** (`../src`) — the GitHub-App **token exchange**
  boundary. It hands the CI job a scoped installation token as the Noema bot
  identity. It never runs untrusted repository code.
- **`noema_reviewer`** (this package) — the **judgement** plane. It turns a
  bounded pull-request manifest into a validated `ReviewVerdict` and can publish
  it as an independent GitHub review.

## Contract

The verdict shape is the JSON contract from the sandbox plan:

```json
{
  "verdict": "approve | request_changes | blocked",
  "summary": "…",
  "findings": [{"severity": "critical|high|medium|low|info", "path": "…", "line": 1, "evidence": "…", "recommendation": "…"}],
  "suggested_patch_ref": null,
  "blocked_reasons": [],
  "confidence": "high | medium | low"
}
```

Two guarantees are enforced deterministically around the LLM (`gating.py`), so
they hold regardless of what the model says:

1. **Strict runs never pass silently.** With `--strict`, a manifest missing its
   diff, changed-file context, or current check conclusions returns a `blocked`
   verdict that names every gap.
2. **MEDIUM-or-higher dependency findings can't ride out on an approve.** An
   unresolved OSV/Trivy/dependency-review finding at MEDIUM+ downgrades an
   approval to `request_changes` with the finding attached — the org rule is
   "remediate by bump, not gate weakening".

The driver sits behind the small `ReviewAgent` protocol, so the sandbox plan's
"Codex, OpenCode, PydanticAI, or another driver" swap is a one-line change.

## Usage

```bash
# Review a PR end to end (fetch manifest via gh, publish the verdict):
python -m noema_reviewer --repo ContextualWisdomLab/naruon --pr-number 1039 --strict --publish

# Judge a prepared manifest offline and print the verdict JSON:
python -m noema_reviewer --manifest-file manifest.json
```

Exit code: `0` for approve/blocked, `2` for request_changes.

## Configuration

The model call goes to an OpenAI-compatible endpoint (the
`contextual-orchestrator` gateway in production). Settings are resolved
KV-first, with the CI secret environment as bootstrap transport only
(`config.py`):

- `NOEMA_LLM_MODEL`
- `NOEMA_LLM_API_URL`
- `NOEMA_LLM_API_KEY`

Publication uses the Noema GitHub-App installation token (from the Worker) or a
`NOEMA_REVIEW_TOKEN` fallback with `pull-requests: write`.

## Develop

```bash
pip install -e .[dev]          # or: pip install pydantic-ai-slim[openai] pytest pytest-cov interrogate
python -m pytest               # 100% line+branch coverage gate
python -m interrogate -c pyproject.toml noema_reviewer   # 100% docstring gate
```

Tests drive the agent with PydanticAI's offline `TestModel`/`FunctionModel` and
a stub `gh` runner — no network, no secret, no real model.
