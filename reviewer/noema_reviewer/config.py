"""Reviewer model/credential resolution.

Per the repo ``AGENTS.md`` rule, secrets are not read ad hoc from the process
environment at runtime: they come from a KV / credential registry. This module
centralises that read into one place. A ``credential_getter`` (the KV) is the
source of truth; the process environment is only the bootstrap *transport* the
CI step uses to hand secrets to the KV, so the env fallback is explicit and
documented rather than scattered ``os.getenv`` reads.

The reviewer talks to an OpenAI-compatible endpoint (the
``contextual-orchestrator`` gateway in production). Upstream model selection
stays in that gateway; leftover sequential ``NOEMA_FALLBACK_*`` settings and
repository-authored model-attempt controls fail closed instead of creating a
second inference policy inside Noema. Request-level ZDR policy is carried as an
explicit trusted boolean; repository visibility remains the workflow owner's
source of that policy.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

from pydantic_ai.models import Model


CredentialGetter = Callable[[str], str | None]
_LOOPBACK_MODEL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_LEGACY_GATEWAY_SERVICE_ALIAS = "contextual-orchestrator"
_CANONICAL_ROUTING_ALIAS = "orchestrator/free"
_LEGACY_ATTEMPT_CONTROLS = (
    "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS",
    "NOEMA_LLM_MAX_RETRIES",
)


@dataclass(frozen=True)
class ReviewerConfig:
    """Resolved settings for one production review request."""

    model_name: str
    base_url: str
    api_key: str
    zdr_only: bool = False


def _read(name: str, credential_getter: CredentialGetter | None) -> str:
    """Read a setting from the KV credential getter, falling back to env transport."""
    if credential_getter is not None:
        value = credential_getter(name)
        if value:
            return value.strip()
    return (os.environ.get(name) or "").strip()


def _read_zdr_policy(credential_getter: CredentialGetter | None) -> bool:
    """Parse the trusted request-level privacy policy without truthy coercion."""
    raw = _read("NOEMA_LLM_ZDR_ONLY", credential_getter)
    if raw in ("", "false"):
        return False
    if raw == "true":
        return True
    raise RuntimeError("NOEMA_LLM_ZDR_ONLY must be exactly true or false")


def _reject_legacy_attempt_controls(credential_getter: CredentialGetter | None) -> None:
    """Fail closed if Noema-local model timeout or retry allocation is configured."""
    configured = [
        name for name in _LEGACY_ATTEMPT_CONTROLS if _read(name, credential_getter)
    ]
    if configured:
        raise RuntimeError(
            ", ".join(configured)
            + " is not allowed; model attempt allocation belongs to contextual-orchestrator"
        )


def _require_single_routing_alias(name: str, value: str) -> None:
    """Require the single governed free-pool alias for every Noema model call."""
    if value != _CANONICAL_ROUTING_ALIAS:
        raise RuntimeError(f"{name} must equal {_CANONICAL_ROUTING_ALIAS}")


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

    The historical service-name value ``contextual-orchestrator`` is accepted
    only as a bootstrap-transport compatibility value and immediately
    canonicalized to ``orchestrator/free``. No downstream model call can use
    the paid-inclusive legacy alias. Legacy model-attempt timeout/retry settings
    fail closed because contextual-orchestrator owns inference allocation.

    Raises:
        RuntimeError: when required gateway configuration is missing or a
            routing, attempt-allocation, privacy, or transport contract drifts.
    """
    model_name = _read("NOEMA_LLM_MODEL", credential_getter)
    base_url = _read("NOEMA_LLM_API_URL", credential_getter)
    api_key = _read("NOEMA_LLM_API_KEY", credential_getter)
    _reject_legacy_attempt_controls(credential_getter)
    zdr_only = _read_zdr_policy(credential_getter)
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
            + ". contextual-orchestrator routing is pinned to orchestrator/free, "
            "the fail-closed zero-cost ZDR-first pool."
        )
    if model_name == _LEGACY_GATEWAY_SERVICE_ALIAS:
        model_name = _CANONICAL_ROUTING_ALIAS
    _require_single_routing_alias("NOEMA_LLM_MODEL", model_name)
    _require_safe_model_endpoint("NOEMA_LLM_API_URL", base_url)
    return ReviewerConfig(
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
        zdr_only=zdr_only,
    )


def resolve_model(config: ReviewerConfig | None = None) -> Model:
    """Build one OpenAI-compatible gateway model without Noema-local retries."""
    from openai import AsyncOpenAI
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    resolved = config or resolve_config()
    _require_single_routing_alias("NOEMA_LLM_MODEL", resolved.model_name)
    _require_safe_model_endpoint("NOEMA_LLM_API_URL", resolved.base_url)

    client = AsyncOpenAI(
        base_url=resolved.base_url,
        api_key=resolved.api_key,
        timeout=None,
        max_retries=0,
    )
    return OpenAIChatModel(
        resolved.model_name,
        provider=OpenAIProvider(openai_client=client),
    )
