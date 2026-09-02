"""Shared PydanticAI Agent-construction wiring for Noema's per-context consumers.

Every Noema consumer (this repository's CI second reviewer, naruon's tenant
agent, and any future consumer) independently wired the same three-step
PydanticAI chain — an ``AsyncOpenAI`` client, wrapped in ``OpenAIChatModel``,
wrapped in ``OpenAIProvider``, then handed to ``Agent(...)`` — and nothing
else. This module is that shared scaffolding, factored out once a second
genuine same-language duplicate of it existed (naruon's
``noema_agent.py:build_noema_agent`` and this repository's
``noema_reviewer``).

This package deliberately owns none of a consumer's domain logic: no verdict
schema, no tool/deps machinery, no credential resolution or validation
policy, no tenant isolation. Those stay local to each bounded context. See
``docs/adr/0012-shared-noema-core-package.md`` in
``ContextualWisdomLab/noema`` for the full rationale and scope boundary.
"""

from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI
from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider


NOEMA_PERSONA = "You are Noema, an independent AI agent for ContextualWisdomLab."
"""The shared identity fragment every consumer's system prompt should open with.

Each consumer still writes and owns the rest of its own system prompt (this
repository's evidence-and-findings rules, naruon's tool-use guidance, and so
on). This constant is only the shared name/tone fragment — not a full
persona, and not a verdict or output schema.
"""


def build_openai_model(
    *,
    base_url: str,
    api_key: str,
    model_name: str,
    timeout: float | None = None,
    max_retries: int = 1,
) -> Model:
    """Wire an OpenAI-compatible PydanticAI model from resolved connection settings.

    This is the ``AsyncOpenAI`` -> ``OpenAIChatModel`` -> ``OpenAIProvider``
    chain every Noema consumer needs to talk to an OpenAI-compatible gateway
    (``contextual-orchestrator`` in production for this repository and for
    naruon's gateway-routed path). Resolving and validating ``base_url``,
    ``api_key``, and ``model_name`` — KV lookups, env fallback, allowed-host
    checks, routing-alias policy, and the like — stays the caller's
    responsibility; this function only performs the construction.
    """
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
        timeout=timeout,
        max_retries=max_retries,
    )
    return OpenAIChatModel(model_name, provider=OpenAIProvider(openai_client=client))


def build_agent(
    model: Model | str,
    *,
    system_prompt: str,
    output_type: Any = str,
    deps_type: Any = None,
    retries: int = 3,
) -> Agent[Any, Any]:
    """Construct a PydanticAI ``Agent`` using Noema's shared model wiring.

    ``output_type`` (a consumer's verdict/result schema), ``deps_type`` (a
    consumer's tool/deps machinery), and ``system_prompt`` (persona plus
    domain instructions) all stay per-consumer — this function only
    centralizes the repeated ``Agent(...)`` construction call.
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
