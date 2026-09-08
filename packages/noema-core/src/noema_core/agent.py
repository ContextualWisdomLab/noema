"""Shared PydanticAI Agent-construction wiring for Noema's per-context consumers.

The Shared Kernel centralizes only framework-neutral Noema agent construction
that is safe to reuse across bounded contexts. Provider discovery, endpoint
selection, credentials, provider SDKs, model routing and failover remain outside
this package and are supplied through an already constructed PydanticAI model.

This package deliberately owns none of a consumer's domain logic: no verdict
schema, no tool/deps machinery, no credential resolution or validation policy,
no tenant isolation. Those stay local to each bounded context. See
``docs/adr/0014-shared-noema-core-package.md`` in
``ContextualWisdomLab/noema`` for the full rationale and scope boundary.
"""

from __future__ import annotations

from typing import Any

from pydantic_ai import Agent
from pydantic_ai.models import Model


NOEMA_PERSONA = "You are Noema"
"""The role-neutral identity prefix shared by Noema's bounded-context agents.

Consumers append their own precise role, organization context, evidence rules,
tool authority and output contract. Keeping this fragment role-neutral avoids
silently broadening a specialized reviewer, runtime agent or application agent
when the shared identity is reused.
"""


def build_agent(
    model: Model,
    *,
    system_prompt: str,
    output_type: Any = str,
    deps_type: Any = None,
) -> Agent[Any, Any]:
    """Construct a PydanticAI ``Agent`` around a caller-owned model adapter.

    ``model`` must already be a constructed PydanticAI ``Model`` so provider
    discovery, credentials, routing, failover, and retry policy cannot migrate
    into Noema's Shared Kernel through PydanticAI convenience configuration.
    ``output_type`` (a consumer's verdict/result schema), ``deps_type`` (a
    consumer's tool/deps machinery), and ``system_prompt`` (identity plus domain
    instructions) remain per-consumer. Model-attempt retry is disabled here;
    contextual-orchestrator owns provider/model retry and failover semantics.
    """
    if not isinstance(model, Model):
        raise TypeError("model must be a constructed PydanticAI Model")

    kwargs: dict[str, Any] = {}
    if deps_type is not None:
        kwargs["deps_type"] = deps_type
    return Agent(
        model,
        output_type=output_type,
        system_prompt=system_prompt,
        retries=0,
        **kwargs,
    )
