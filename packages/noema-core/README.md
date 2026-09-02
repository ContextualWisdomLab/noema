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
`noema-core` is not yet published to an immutable package index, so external
consumers must not pin a mutable branch or copy this source. During this
transition the `noema-reviewer` wheel includes `noema_core` directly from this
single canonical source path through setuptools package mapping. Required
`reviewer-ci` runs this package's 100% line/branch and docstring gates and then
smoke-installs the reviewer wheel outside the checkout.

Publishing `noema-core` through the repository's selected immutable package
mechanism and moving consumers to a normal versioned dependency are tracked as
follow-ups in the ADR.

## Develop

```bash
pip install -e .
python -m pytest             # 100% line+branch coverage gate
python -m interrogate -c pyproject.toml src/noema_core   # 100% docstring gate
```
