"""Tests for reviewer configuration and model resolution."""

from __future__ import annotations

import pytest

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
