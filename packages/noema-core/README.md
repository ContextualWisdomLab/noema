# noema-core

Provider-neutral PydanticAI `Agent` construction shared by Noema's per-context
consumers. See [`docs/adr/0014-shared-noema-core-package.md`](../../docs/adr/0014-shared-noema-core-package.md)
for the decision and its scope boundary.

## What this package is

One function and one role-neutral identity fragment shared without moving
provider or bounded-context authority into Noema:

- `build_agent(model, *, system_prompt, output_type=str, deps_type=None, retries=3) -> Agent`
  constructs an agent around a caller-supplied, already constructed PydanticAI
  `Model`. String model names are rejected so provider/model discovery cannot
  occur inside the Shared Kernel.
- `NOEMA_PERSONA` is exactly `"You are Noema"`. Consumers compose that stable
  identity with their own precise role, organization context, evidence rules,
  tool authority and output contract; the Shared Kernel does not assign a
  generic role that could weaken a specialized reviewer or runtime agent.

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
transition the `noema-reviewer` distribution includes `noema_core` from this
single canonical source path through the custom packaging backend. Wheel and
sdist builds stage a bounded snapshot; editable installs keep an ignored
canonical-source view so their package mapping remains valid after the PEP 660
hook completes. Required `reviewer-ci` runs this package's 100% line/branch and
docstring gates and validates installed distributions outside the checkout.

Publishing `noema-core` through the repository's selected immutable package
mechanism and moving consumers to a normal versioned dependency are tracked as
follow-ups in the ADR.

## Develop

```bash
pip install -e .
python -m pytest             # 100% line+branch coverage gate
python -m interrogate -c pyproject.toml src/noema_core   # 100% docstring gate
```
