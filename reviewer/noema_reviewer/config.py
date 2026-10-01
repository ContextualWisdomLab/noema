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

import json
import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from ipaddress import ip_address
from urllib.parse import unquote, urlsplit, urlunsplit

from pydantic_ai.models import Model


CredentialGetter = Callable[[str], str | None]
_DIRECT_PROVIDER_HOSTS = frozenset(
    {
        "api.openai.com",
        "models.github.ai",
        "openrouter.ai",
        "integrate.api.nvidia.com",
        "api.nvidia.com",
        "api.bytez.com",
    }
)
_CANONICAL_ROUTING_ALIAS = "orchestrator/free"
_LEGACY_ATTEMPT_CONTROLS = (
    "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS",
    "NOEMA_LLM_MAX_RETRIES",
)
_NONCANONICAL_NUMERIC_HOST = re.compile(
    r"^(?:0[xX][0-9A-Fa-f]+|[0-9]+)(?:\.(?:0[xX][0-9A-Fa-f]+|[0-9]+))*$"
)


@dataclass(frozen=True)
class ReviewerConfig:
    """Resolved settings for one production review request."""

    model_name: str
    base_url: str
    api_key: str
    allowed_base_urls: tuple[str, ...]
    zdr_only: bool = False


def _read(name: str, credential_getter: CredentialGetter | None) -> str:
    """Read a setting from the KV credential getter, falling back to env transport."""
    if credential_getter is not None:
        value = credential_getter(name)
        if value:
            return value.strip()
    return (os.environ.get(name) or "").strip()


def _read_exact(name: str, credential_getter: CredentialGetter | None) -> str:
    """Read endpoint authority without silently canonicalizing whitespace."""
    if credential_getter is not None:
        value = credential_getter(name)
        if value:
            return value
    return os.environ.get(name) or ""


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


def _canonical_model_endpoint(name: str, value: str) -> str:
    """Require the reviewed gateway URL shape before a credential can be attached."""
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        username = parsed.username
        password = parsed.password
        port = parsed.port
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a valid model endpoint URL") from exc

    raw_hostname = hostname or ""
    try:
        normalized_hostname = raw_hostname.encode("idna").decode("ascii").lower().rstrip(".")
    except UnicodeError as exc:
        raise RuntimeError(f"{name} must be a valid model endpoint URL") from exc
    if not normalized_hostname:
        raise RuntimeError(f"{name} must be a valid model endpoint URL")
    if (
        raw_hostname.endswith(".")
        or "*" in value
        or "%" in parsed.netloc
        or "\\" in value
    ):
        raise RuntimeError(f"{name} must be an exact canonical model endpoint URL")
    if username is not None or password is not None or parsed.query or parsed.fragment:
        raise RuntimeError(f"{name} must not contain userinfo, query, or fragment")

    path = parsed.path.rstrip("/")
    if any(unquote(segment) in {".", ".."} for segment in parsed.path.split("/")):
        raise RuntimeError(f"{name} must be an exact canonical model endpoint URL")
    if not path.endswith("/v1"):
        raise RuntimeError(f"{name} must end in /v1")

    if normalized_hostname in _DIRECT_PROVIDER_HOSTS:
        raise RuntimeError(
            f"{name} must target contextual-orchestrator, not a direct model provider"
        )

    try:
        parsed_ip = ip_address(normalized_hostname)
        if getattr(parsed_ip, "ipv4_mapped", None) is not None:
            raise RuntimeError(
                f"{name} must not use an IPv4-mapped IPv6 endpoint"
            )
        loopback_ip = parsed_ip.is_loopback
        normalized_hostname = parsed_ip.compressed
    except ValueError:
        if _NONCANONICAL_NUMERIC_HOST.fullmatch(normalized_hostname):
            raise RuntimeError(
                f"{name} must be an exact canonical model endpoint URL"
            )
        loopback_ip = False
    if (
        normalized_hostname == "localhost"
        or normalized_hostname.endswith(".localhost")
        or loopback_ip
    ):
        raise RuntimeError(f"{name} must not target a loopback endpoint")

    if parsed.scheme != "https":
        raise RuntimeError(f"{name} must use HTTPS")
    canonical_hostname = (
        f"[{normalized_hostname}]" if ":" in normalized_hostname else normalized_hostname
    )
    canonical_netloc = canonical_hostname
    if port is not None and port != 443:
        canonical_netloc = f"{canonical_hostname}:{port}"
    canonical = urlunsplit(("https", canonical_netloc, path, "", ""))
    if value != canonical:
        raise RuntimeError(f"{name} must be an exact canonical model endpoint URL")
    return canonical


def _parse_model_endpoint_allowlist(raw_json: str) -> tuple[str, ...]:
    """Parse exact released gateway endpoints without adding routing order."""
    try:
        decoded = json.loads(raw_json)
    except (TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            "NOEMA_LLM_API_URL_ALLOWLIST_JSON must be a non-empty JSON array "
            "of exact released endpoints"
        ) from exc
    if not isinstance(decoded, list) or not decoded:
        raise RuntimeError(
            "NOEMA_LLM_API_URL_ALLOWLIST_JSON must be a non-empty JSON array "
            "of exact released endpoints"
        )
    canonical: list[str] = []
    for value in decoded:
        if not isinstance(value, str) or not value:
            raise RuntimeError(
                "NOEMA_LLM_API_URL_ALLOWLIST_JSON members must be exact released endpoint URLs"
            )
        endpoint = _canonical_model_endpoint(
            "NOEMA_LLM_API_URL_ALLOWLIST_JSON", value
        )
        if endpoint in canonical:
            raise RuntimeError(
                "NOEMA_LLM_API_URL_ALLOWLIST_JSON must not contain duplicate endpoints"
            )
        canonical.append(endpoint)
    return tuple(canonical)


def _require_safe_model_endpoint(
    name: str, value: str, allowed_base_urls: tuple[str, ...]
) -> None:
    """Require exact membership in the released gateway endpoint set."""
    endpoint = _canonical_model_endpoint(name, value)
    if endpoint not in allowed_base_urls:
        raise RuntimeError(
            f"{name} is not an allowed released contextual-orchestrator endpoint"
        )


def resolve_config(credential_getter: CredentialGetter | None = None) -> ReviewerConfig:
    """Resolve reviewer configuration from the KV getter or env transport.

    ``NOEMA_LLM_MODEL`` must be exactly ``orchestrator/free``. Stale service-name,
    provider/model, paid-pool, or alternate routing aliases fail closed instead
    of being normalized inside Noema. Legacy model-attempt timeout/retry settings
    also fail closed because contextual-orchestrator owns inference allocation.

    Raises:
        RuntimeError: when required gateway configuration is missing or a
            routing, attempt-allocation, privacy, or transport contract drifts.
    """
    model_name = _read("NOEMA_LLM_MODEL", credential_getter)
    base_url = _read_exact("NOEMA_LLM_API_URL", credential_getter)
    allowlist_json = _read_exact(
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON", credential_getter
    )
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
            ("NOEMA_LLM_API_URL_ALLOWLIST_JSON", allowlist_json),
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
    _require_single_routing_alias("NOEMA_LLM_MODEL", model_name)
    allowed_base_urls = _parse_model_endpoint_allowlist(allowlist_json)
    _require_safe_model_endpoint("NOEMA_LLM_API_URL", base_url, allowed_base_urls)
    return ReviewerConfig(
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
        allowed_base_urls=allowed_base_urls,
        zdr_only=zdr_only,
    )


def resolve_model(config: ReviewerConfig | None = None) -> Model:
    """Build one OpenAI-compatible gateway model without Noema-local retries."""
    from openai import AsyncOpenAI
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    resolved = config or resolve_config()
    _require_single_routing_alias("NOEMA_LLM_MODEL", resolved.model_name)
    _require_safe_model_endpoint(
        "NOEMA_LLM_API_URL", resolved.base_url, resolved.allowed_base_urls
    )

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
