"""Shared PydanticAI Agent-construction wiring for Noema's per-context consumers.

The Shared Kernel centralizes only framework-neutral Noema agent construction
that is safe to reuse across bounded contexts. Provider discovery, endpoint
selection, credentials, provider SDKs, model routing and failover remain outside
this package and are supplied through an already constructed PydanticAI model.

This package deliberately owns none of a consumer's domain logic: no verdict
schema, no tool/deps machinery, no credential resolution or validation policy,
no tenant isolation. Those stay local to each bounded context. See
``docs/adr/0012-shared-noema-core-package.md`` in
``ContextualWisdomLab/noema`` for the full rationale and scope boundary.
"""

from __future__ import annotations

from typing import Any

from pydantic_ai import Agent
from pydantic_ai.models import Model


NOEMA_PERSONA = "You are Noema, an independent AI agent for ContextualWisdomLab."
"""The shared identity fragment every consumer's system prompt should open with.

Each consumer still writes and owns the rest of its own system prompt (this
repository's evidence-and-findings rules, naruon's tool-use guidance, and so
on). This constant is only the shared name/tone fragment — not a full
persona, and not a verdict or output schema.
"""


def build_agent(
    model: Model | str,
    *,
    system_prompt: str,
    output_type: Any = str,
    deps_type: Any = None,
    retries: int = 3,
) -> Agent[Any, Any]:
    """Construct a PydanticAI ``Agent`` around a caller-owned model adapter.

    ``model`` is injected so provider transport, credentials, routing and
    failover cannot migrate into Noema's Shared Kernel. ``output_type`` (a
    consumer's verdict/result schema), ``deps_type`` (a consumer's tool/deps
    machinery), and ``system_prompt`` (persona plus domain instructions) also
    remain per-consumer. This function centralizes only the repeated
    ``Agent(...)`` construction call.
    """
    kwargs: dict[str, Any] = {}
    if deps_type is not None:
        kwargs["deps_type"] = deps_type
    return Agent(
        model,
        output_type=output_type,
        system_prompt=system_prompt,
        retries=retries,
        **kwargs,
    )
