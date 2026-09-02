# noema-core

Shared PydanticAI `Agent`-construction wiring for Noema's per-context
consumers. See [`docs/adr/0012-shared-noema-core-package.md`](../../docs/adr/0012-shared-noema-core-package.md)
for the decision and its scope boundary.

## What this package is

Two functions and one constant, extracted from `reviewer/noema_reviewer`
after the same `AsyncOpenAI` → `OpenAIChatModel` → `OpenAIProvider` →
`Agent(...)` wiring was found independently built in
`ContextualWisdomLab/naruon`'s `noema_agent.py`:

- `build_openai_model(*, base_url, api_key, model_name, timeout=None, max_retries=1) -> Model`
- `build_agent(model, *, system_prompt, output_type=str, deps_type=None, retries=3) -> Agent`
- `NOEMA_PERSONA` — the shared "You are Noema, an independent AI agent for
  ContextualWisdomLab." identity fragment consumers prepend to their own
  system prompt.

## What this package explicitly is not

It does not own a verdict/output schema, tool/deps machinery, credential
resolution or validation policy, or tenant isolation. Those stay local to
each consumer's own bounded context.

## Status

Self-consumption only: `reviewer/noema_reviewer` is the sole consumer today.
Not yet published to an index — consumed via `PYTHONPATH` (see
`reviewer/pyproject.toml`'s `pythonpath` and `.github/workflows/central-review.yml`).
Publishing to PyPI and naruon's adoption are tracked as follow-ups in the ADR.

## Develop

```bash
pip install -e .[dev]
python -m pytest             # 100% line+branch coverage gate
python -m interrogate -c pyproject.toml src/noema_core   # 100% docstring gate
```
