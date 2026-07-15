"""Tests for reviewer configuration and model resolution."""

from __future__ import annotations

import pytest
from httpx import Request
from openai import APITimeoutError
from pydantic_ai.models.fallback import FallbackModel

from noema_reviewer.config import ReviewerConfig, resolve_config, resolve_model


def _kv(values: dict[str, str]):
    """Build a credential getter backed by a dict."""
    return lambda name: values.get(name)


def test_resolve_config_prefers_credential_getter() -> None:
    """The KV getter is the source of truth over process env."""
    getter = _kv(
        {
            "NOEMA_LLM_MODEL": "gpt-x",
            "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
            "NOEMA_LLM_API_KEY": "secret",
        }
    )
    config = resolve_config(getter)
    assert config == ReviewerConfig(
        model_name="gpt-x",
        base_url="https://orchestrator.example/v1",
        api_key="secret",
    )


def test_resolve_config_falls_back_to_env(monkeypatch) -> None:
    """Env transport supplies values when the KV getter has none."""
    monkeypatch.setenv("NOEMA_LLM_MODEL", "m")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://x/v1")
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "k")
    config = resolve_config()
    assert config.model_name == "m"


def test_resolve_config_getter_miss_falls_back_to_env(monkeypatch) -> None:
    """When the KV getter has no value for a key, env transport supplies it."""
    monkeypatch.setenv("NOEMA_LLM_MODEL", "env-model")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://env/v1")
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "env-key")
    config = resolve_config(_kv({}))
    assert config.model_name == "env-model"


def test_resolve_config_raises_when_unconfigured(monkeypatch) -> None:
    """A missing setting raises loudly and names what is missing."""
    for name in ("NOEMA_LLM_MODEL", "NOEMA_LLM_API_URL", "NOEMA_LLM_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(RuntimeError) as excinfo:
        resolve_config()
    assert "NOEMA_LLM_MODEL" in str(excinfo.value)


def test_resolve_model_builds_openai_model() -> None:
    """resolve_model builds an OpenAI-compatible model from config."""
    config = ReviewerConfig(model_name="gpt-x", base_url="https://x/v1", api_key="k")
    model = resolve_model(config)
    assert model is not None


def test_resolve_config_builds_bounded_fallback(monkeypatch) -> None:
    """A complete fallback and long request budget are preserved explicitly."""
    values = {
        "NOEMA_LLM_MODEL": "primary",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS": "5400",
        "NOEMA_LLM_MAX_RETRIES": "4",
        "NOEMA_FALLBACK_LLM_MODEL": "openai/gpt-4.1",
        "NOEMA_FALLBACK_LLM_API_URL": "https://models.github.ai/inference",
        "NOEMA_FALLBACK_LLM_API_KEY": "fallback-key",
    }
    config = resolve_config(_kv(values))
    assert config.request_timeout_seconds == 5400
    assert config.max_retries == 4
    model = resolve_model(config)
    assert isinstance(model, FallbackModel)
    timeout = APITimeoutError(Request("POST", "https://primary.example/v1"))
    assert model._exception_handlers[0](timeout) is True


def test_resolve_config_rejects_partial_fallback() -> None:
    """A partial fallback fails visibly instead of silently skipping it."""
    values = {
        "NOEMA_LLM_MODEL": "primary",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        "NOEMA_FALLBACK_LLM_MODEL": "openai/gpt-4.1",
    }
    with pytest.raises(RuntimeError, match="fallback reviewer configuration is incomplete"):
        resolve_config(_kv(values))


@pytest.mark.parametrize(
    ("name", "value"),
    [("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS", "59"), ("NOEMA_LLM_MAX_RETRIES", "nine")],
)
def test_resolve_config_rejects_invalid_numeric_bounds(name: str, value: str) -> None:
    """Invalid timeout and retry controls name the exact configuration error."""
    values = {
        "NOEMA_LLM_MODEL": "primary",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        name: value,
    }
    with pytest.raises(RuntimeError, match=name):
        resolve_config(_kv(values))
