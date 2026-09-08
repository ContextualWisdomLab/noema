"""Cross-language endpoint contract tests for the Noema reviewer gateway."""

from __future__ import annotations

import pytest

from noema_reviewer.config import resolve_config


def _config(base_url: str) -> dict[str, str]:
    """Return the minimal reviewed gateway configuration for one endpoint."""
    return {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": base_url,
        "NOEMA_LLM_API_KEY": "gateway-token",
    }


def _resolve(base_url: str):
    """Resolve one endpoint through the same credential-getter boundary as production."""
    values = _config(base_url)
    return resolve_config(values.get)


@pytest.mark.parametrize(
    "base_url",
    (
        "https://api.openai.com/v1",
        "https://models.github.ai/v1",
        "https://openrouter.ai/v1",
        "https://integrate.api.nvidia.com/v1",
        "https://api.nvidia.com/v1",
        "https://api.bytez.com/v1",
    ),
)
def test_reviewer_rejects_direct_provider_endpoint(base_url: str) -> None:
    """The Python reviewer must not bypass contextual-orchestrator by URL."""
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL"):
        _resolve(base_url)


@pytest.mark.parametrize(
    "base_url",
    (
        "https://user:password@orchestrator.example/v1",
        "https://orchestrator.example/v1?route=paid",
        "https://orchestrator.example/v1#alternate",
    ),
)
def test_reviewer_rejects_endpoint_metadata_outside_contract(base_url: str) -> None:
    """Userinfo, query, and fragment metadata cannot alter gateway authority."""
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL"):
        _resolve(base_url)


def test_reviewer_rejects_endpoint_without_hostname() -> None:
    """A syntactically parseable HTTPS URL still needs an authority host."""
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL"):
        _resolve("https:///v1")


@pytest.mark.parametrize(
    "base_url",
    (
        "https://orchestrator.example",
        "https://orchestrator.example/chat/completions",
        "https://orchestrator.example/v1beta",
    ),
)
def test_reviewer_requires_openai_compatible_v1_suffix(base_url: str) -> None:
    """Reviewer endpoints must satisfy the same /v1 suffix contract as JS preflight."""
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL"):
        _resolve(base_url)


def test_reviewer_accepts_https_gateway_v1_endpoint() -> None:
    """A normal HTTPS contextual-orchestrator-compatible /v1 endpoint remains valid."""
    config = _resolve("https://orchestrator.example/internal/v1")
    assert config.base_url == "https://orchestrator.example/internal/v1"
