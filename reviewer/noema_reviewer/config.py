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
    request_timeout_seconds: float = 5400.0
    max_retries: int = 1
    fallback_model_name: str = ""
    fallback_base_url: str = ""
    fallback_api_key: str = ""


def _read(name: str, credential_getter: CredentialGetter | None) -> str:
    """Read a setting from the KV credential getter, falling back to env transport."""
    if credential_getter is not None:
        value = credential_getter(name)
        if value:
            return value.strip()
    return (os.environ.get(name) or "").strip()


def _bounded_int(
    name: str,
    default: int,
    minimum: int,
    maximum: int,
    credential_getter: CredentialGetter | None,
) -> int:
    """Read a bounded integer setting and fail with a non-secret reason."""
    raw = _read(name, credential_getter)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


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
    request_timeout_seconds = _bounded_int(
        "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS", 5400, 60, 7200, credential_getter
    )
    max_retries = _bounded_int("NOEMA_LLM_MAX_RETRIES", 1, 0, 8, credential_getter)
    fallback_model_name = _read("NOEMA_FALLBACK_LLM_MODEL", credential_getter)
    fallback_base_url = _read("NOEMA_FALLBACK_LLM_API_URL", credential_getter)
    fallback_api_key = _read("NOEMA_FALLBACK_LLM_API_KEY", credential_getter)
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
    fallback_values = (fallback_model_name, fallback_base_url, fallback_api_key)
    if any(fallback_values) and not all(fallback_values):
        raise RuntimeError(
            "Noema fallback reviewer configuration is incomplete; provide "
            "NOEMA_FALLBACK_LLM_MODEL, NOEMA_FALLBACK_LLM_API_URL, and "
            "NOEMA_FALLBACK_LLM_API_KEY together."
        )
    return ReviewerConfig(
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
        request_timeout_seconds=float(request_timeout_seconds),
        max_retries=max_retries,
        fallback_model_name=fallback_model_name,
        fallback_base_url=fallback_base_url,
        fallback_api_key=fallback_api_key,
    )


def resolve_model(config: ReviewerConfig | None = None) -> Model:
    """Build an OpenAI-compatible PydanticAI model from resolved configuration.

    The reviewer routes every model call through an OpenAI-compatible endpoint
    (the ``contextual-orchestrator`` gateway in production), so the OpenAI
    provider is a required dependency rather than an optional extra.
    """
    from openai import APIConnectionError, AsyncOpenAI
    from pydantic_ai.exceptions import ModelAPIError
    from pydantic_ai.models.fallback import FallbackModel
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    resolved = config or resolve_config()

    def compatible_model(model_name: str, base_url: str, api_key: str) -> Model:
        """Build one OpenAI-compatible model with the shared retry budget."""
        client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            timeout=resolved.request_timeout_seconds,
            max_retries=resolved.max_retries,
        )
        return OpenAIChatModel(model_name, provider=OpenAIProvider(openai_client=client))

    primary = compatible_model(resolved.model_name, resolved.base_url, resolved.api_key)
    if not resolved.fallback_model_name:
        return primary
    fallback = compatible_model(
        resolved.fallback_model_name,
        resolved.fallback_base_url,
        resolved.fallback_api_key,
    )
    return FallbackModel(
        primary,
        fallback,
        fallback_on=(ModelAPIError, APIConnectionError),
    )
