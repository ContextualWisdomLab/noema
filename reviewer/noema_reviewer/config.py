"""Reviewer model/credential resolution.

Per the repo ``AGENTS.md`` rule, secrets are not read ad hoc from the process
environment at runtime: they come from a KV / credential registry. This module
centralises that read into one place. A ``credential_getter`` (the KV) is the
source of truth; the process environment is only the bootstrap *transport* the
CI step uses to hand secrets to the KV, so the env fallback is explicit and
documented rather than scattered ``os.getenv`` reads.

The reviewer talks to an OpenAI-compatible endpoint (the
``contextual-orchestrator`` gateway in production). Upstream model selection
stays in that gateway; leftover sequential ``NOEMA_FALLBACK_*`` settings fail
closed instead of trying the next model inside Noema.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

from pydantic_ai.models import Model


CredentialGetter = Callable[[str], str | None]
_LOOPBACK_MODEL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


@dataclass(frozen=True)
class ReviewerConfig:
    """Resolved settings for a production review agent."""

    model_name: str
    base_url: str
    api_key: str
    request_timeout_seconds: float = 5400.0
    max_retries: int = 1


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


def _require_single_routing_alias(name: str, value: str) -> None:
    """Reject sequential candidate lists and direct-provider model prefixes."""
    if any(character.isspace() for character in value) or "," in value:
        raise RuntimeError(
            f"{name} must be one routing alias; sequential model candidates are not allowed"
        )
    if value.startswith(("nvidia-nim/", "openai/", "github-models/")):
        raise RuntimeError(
            f"{name} must be the contextual-orchestrator routing alias, "
            "not a direct provider model"
        )


def _require_safe_model_endpoint(name: str, value: str) -> None:
    """Reject credential-bearing model endpoints that use unsafe remote transport."""
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a valid model endpoint URL") from exc
    if hostname and parsed.scheme == "https":
        return
    if parsed.scheme == "http" and hostname in _LOOPBACK_MODEL_HOSTS:
        return
    raise RuntimeError(f"{name} must use HTTPS except for a loopback development endpoint")


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
    leftover_fallback = [
        name
        for name in (
            "NOEMA_FALLBACK_LLM_MODEL",
            "NOEMA_FALLBACK_LLM_API_URL",
            "NOEMA_FALLBACK_LLM_API_KEY",
        )
        if _read(name, credential_getter)
    ]
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
    if leftover_fallback:
        raise RuntimeError(
            "Noema sequential model fallback is not allowed; unset "
            + ", ".join(leftover_fallback)
            + ". contextual-orchestrator selects min-cost / max-performance."
        )
    _require_single_routing_alias("NOEMA_LLM_MODEL", model_name)
    _require_safe_model_endpoint("NOEMA_LLM_API_URL", base_url)
    return ReviewerConfig(
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
        request_timeout_seconds=float(request_timeout_seconds),
        max_retries=max_retries,
    )


def resolve_model(config: ReviewerConfig | None = None) -> Model:
    """Build an OpenAI-compatible PydanticAI model from resolved configuration.

    The reviewer routes every model call through an OpenAI-compatible endpoint
    (the ``contextual-orchestrator`` gateway in production), so the OpenAI
    provider is a required dependency rather than an optional extra.
    """
    from openai import AsyncOpenAI
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    resolved = config or resolve_config()
    _require_single_routing_alias("NOEMA_LLM_MODEL", resolved.model_name)
    _require_safe_model_endpoint("NOEMA_LLM_API_URL", resolved.base_url)

    client = AsyncOpenAI(
        base_url=resolved.base_url,
        api_key=resolved.api_key,
        timeout=resolved.request_timeout_seconds,
        max_retries=resolved.max_retries,
    )
    return OpenAIChatModel(
        resolved.model_name,
        provider=OpenAIProvider(openai_client=client),
    )
