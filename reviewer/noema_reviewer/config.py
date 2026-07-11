"""Reviewer model/credential resolution.

Per the repo ``AGENTS.md`` rule, secrets are not read ad hoc from the process
environment at runtime: they come from a KV / credential registry. This module
centralises that read into one place. A ``credential_getter`` (the KV) is the
source of truth; the process environment is only the bootstrap *transport* the
CI step uses to hand secrets to the KV, so the env fallback is explicit and
documented rather than scattered ``os.getenv`` reads.

The reviewer talks to an OpenAI-compatible endpoint (the
``contextual-orchestrator`` gateway in production), so a swap of upstream model
is a config change, not a code change.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass

from pydantic_ai.models import Model


CredentialGetter = Callable[[str], str | None]


@dataclass(frozen=True)
class ReviewerConfig:
    """Resolved settings for a production review agent."""

    model_name: str
    base_url: str
    api_key: str


def _read(name: str, credential_getter: CredentialGetter | None) -> str:
    """Read a setting from the KV credential getter, falling back to env transport."""
    if credential_getter is not None:
        value = credential_getter(name)
        if value:
            return value.strip()
    return (os.environ.get(name) or "").strip()


def resolve_config(credential_getter: CredentialGetter | None = None) -> ReviewerConfig:
    """Resolve reviewer configuration from the KV getter or env transport.

    Raises:
        RuntimeError: when the model name, base URL, or API key is not
            configured, so a misconfiguration fails loudly instead of letting
            the reviewer silently skip its verdict.
    """
    model_name = _read("NOEMA_LLM_MODEL", credential_getter)
    base_url = _read("NOEMA_LLM_API_URL", credential_getter)
    api_key = _read("NOEMA_LLM_API_KEY", credential_getter)
    missing = [
        name
        for name, value in (
            ("NOEMA_LLM_MODEL", model_name),
            ("NOEMA_LLM_API_URL", base_url),
            ("NOEMA_LLM_API_KEY", api_key),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Noema reviewer is unconfigured; missing " + ", ".join(missing) + ". "
            "Provide them through the credential registry (KV) or the CI secret "
            "transport before running a review."
        )
    return ReviewerConfig(model_name=model_name, base_url=base_url, api_key=api_key)


def resolve_model(config: ReviewerConfig | None = None) -> Model:
    """Build an OpenAI-compatible PydanticAI model from resolved configuration.

    The reviewer routes every model call through an OpenAI-compatible endpoint
    (the ``contextual-orchestrator`` gateway in production), so the OpenAI
    provider is a required dependency rather than an optional extra.
    """
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    resolved = config or resolve_config()
    provider = OpenAIProvider(base_url=resolved.base_url, api_key=resolved.api_key)
    return OpenAIChatModel(resolved.model_name, provider=provider)
