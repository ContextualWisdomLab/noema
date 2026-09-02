# noema-core

Provider-neutral PydanticAI `Agent` construction shared by Noema's per-context
consumers. See [`docs/adr/0012-shared-noema-core-package.md`](../../docs/adr/0012-shared-noema-core-package.md)
for the decision and its scope boundary.

## What this package is

One function and one identity fragment shared without moving provider authority
into Noema:

- `build_agent(model, *, system_prompt, output_type=str, deps_type=None, retries=3) -> Agent`
  constructs an agent around a caller-supplied PydanticAI model adapter.
- `NOEMA_PERSONA` is the shared "You are Noema, an independent AI agent for
  ContextualWisdomLab." identity fragment consumers prepend to their own
  system prompt.

The injected model is deliberate. `noema-core` does not construct `AsyncOpenAI`,
`OpenAIChatModel`, `OpenAIProvider`, provider credentials, model discovery,
routing or failover. A consuming bounded context may own a transport adapter to
the published `contextual-orchestrator` interface, but that adapter does not
become Shared Kernel authority.

## What this package explicitly is not

It does not own a verdict/output schema, tool/deps machinery, credential
resolution or validation policy, provider SDK, routing policy, provider
fallback, or tenant isolation. Those stay with their canonical owners.

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
