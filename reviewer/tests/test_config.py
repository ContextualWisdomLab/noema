"""Tests for reviewer configuration and model resolution."""

from __future__ import annotations

import pytest
from pydantic_ai.models.openai import OpenAIChatModel

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
    """resolve_model builds one OpenAI-compatible gateway model from config."""
    config = ReviewerConfig(model_name="gpt-x", base_url="https://x/v1", api_key="k")
    model = resolve_model(config)
    assert isinstance(model, OpenAIChatModel)


def test_resolve_config_preserves_request_budget_without_sequential_fallback() -> None:
    """Timeout and retry knobs stay on the single orchestrator-backed model."""
    values = {
        "NOEMA_LLM_MODEL": "contextual-orchestrator",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS": "5400",
        "NOEMA_LLM_MAX_RETRIES": "4",
    }
    config = resolve_config(_kv(values))
    assert config.request_timeout_seconds == 5400
    assert config.max_retries == 4
    model = resolve_model(config)
    assert isinstance(model, OpenAIChatModel)
    assert not hasattr(config, "fallback_model_name")


def test_resolve_config_rejects_complete_leftover_fallback_bundle() -> None:
    """A complete leftover fallback bundle still fails closed."""
    values = {
        "NOEMA_LLM_MODEL": "contextual-orchestrator",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        "NOEMA_FALLBACK_LLM_MODEL": "openai/gpt-4.1",
        "NOEMA_FALLBACK_LLM_API_URL": "https://models.github.ai/inference",
        "NOEMA_FALLBACK_LLM_API_KEY": "fallback-key",
    }
    with pytest.raises(RuntimeError, match="sequential model fallback is not allowed") as excinfo:
        resolve_config(_kv(values))
    assert "NOEMA_FALLBACK_LLM_MODEL" in str(excinfo.value)
    assert "fallback-key" not in str(excinfo.value)


def test_resolve_config_rejects_leftover_fallback_from_env_transport(monkeypatch) -> None:
    """Env-transport leftover fallback keys fail closed when no KV getter is used."""
    monkeypatch.setenv("NOEMA_LLM_MODEL", "contextual-orchestrator")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://primary.example/v1")
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "primary-key")
    monkeypatch.setenv("NOEMA_FALLBACK_LLM_MODEL", "openai/gpt-4.1")
    with pytest.raises(RuntimeError, match="sequential model fallback is not allowed") as excinfo:
        resolve_config()
    assert "openai/gpt-4.1" not in str(excinfo.value)


@pytest.mark.parametrize(
    "name",
    (
        "NOEMA_FALLBACK_LLM_MODEL",
        "NOEMA_FALLBACK_LLM_API_URL",
        "NOEMA_FALLBACK_LLM_API_KEY",
    ),
)
def test_resolve_config_rejects_leftover_sequential_fallback(name: str) -> None:
    """Leftover fallback secrets fail closed instead of enabling a second model."""
    values = {
        "NOEMA_LLM_MODEL": "contextual-orchestrator",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        name: "must-not-enable-failover",
    }
    with pytest.raises(RuntimeError, match="sequential model fallback is not allowed") as excinfo:
        resolve_config(_kv(values))
    assert name in str(excinfo.value)
    assert "must-not-enable-failover" not in str(excinfo.value)


@pytest.mark.parametrize(
    "model_name",
    ("alpha beta", "alpha,beta", "nvidia-nim/nvidia/llama", "openai/gpt-4.1", "github-models/openai/gpt-4.1"),
)
def test_resolve_config_rejects_sequential_or_direct_provider_models(model_name: str) -> None:
    """The reviewer accepts one routing alias, not a candidate list or provider prefix."""
    values = {
        "NOEMA_LLM_MODEL": model_name,
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_MODEL"):
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


def test_resolve_config_rejects_plaintext_remote_model_endpoints() -> None:
    """Credential-bearing remote model endpoints must not use plaintext HTTP."""
    values = {
        "NOEMA_LLM_MODEL": "primary",
        "NOEMA_LLM_API_URL": "http://reviewer-gateway.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL") as excinfo:
        resolve_config(_kv(values))
    assert "primary-key" not in str(excinfo.value)


def test_resolve_config_rejects_malformed_model_endpoint_with_bounded_error() -> None:
    """Malformed endpoint syntax fails as a named non-secret configuration error."""
    values = {
        "NOEMA_LLM_MODEL": "primary",
        "NOEMA_LLM_API_URL": "http://[::1",
        "NOEMA_LLM_API_KEY": "must-not-appear",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL") as excinfo:
        resolve_config(_kv(values))
    assert "must-not-appear" not in str(excinfo.value)


@pytest.mark.parametrize(
    "config",
    [
        ReviewerConfig(
            model_name="primary",
            base_url="http://reviewer-gateway.example/v1",
            api_key="primary-key",
        ),
        ReviewerConfig(
            model_name="openai/gpt-4.1",
            base_url="https://primary.example/v1",
            api_key="primary-key",
        ),
    ],
)
def test_resolve_model_rejects_manually_constructed_unsafe_config(config: ReviewerConfig) -> None:
    """Injected ReviewerConfig cannot bypass endpoint or routing-alias validation."""
    with pytest.raises(RuntimeError):
        resolve_model(config)


def test_resolve_model_reads_live_config_when_none_is_passed(monkeypatch) -> None:
    """Omitting config still resolves the single gateway model from transport."""
    monkeypatch.setenv("NOEMA_LLM_MODEL", "contextual-orchestrator")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://orchestrator.example/v1")
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "gateway-token")
    model = resolve_model()
    assert isinstance(model, OpenAIChatModel)


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]"])
def test_resolve_config_allows_loopback_http_model_endpoint(host: str) -> None:
    """Local development may use plaintext HTTP only on an exact loopback host."""
    expected_url = f"http://{host}:8080/v1"
    values = {
        "NOEMA_LLM_MODEL": "local",
        "NOEMA_LLM_API_URL": expected_url,
        "NOEMA_LLM_API_KEY": "local-only-key",
    }
    config = resolve_config(_kv(values))
    assert config.base_url == expected_url
