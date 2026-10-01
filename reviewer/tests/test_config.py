"""Tests for reviewer configuration and model resolution."""

from __future__ import annotations

import json

import pytest
from pydantic_ai.models.openai import OpenAIChatModel

from noema_reviewer.config import ReviewerConfig, resolve_config, resolve_model


def _kv(values: dict[str, str]):
    """Build a credential getter backed by a dict."""
    transport = dict(values)
    if (
        "NOEMA_LLM_API_URL" in transport
        and "NOEMA_LLM_API_URL_ALLOWLIST_JSON" not in transport
    ):
        transport["NOEMA_LLM_API_URL_ALLOWLIST_JSON"] = json.dumps(
            [transport["NOEMA_LLM_API_URL"]]
        )
    return lambda name: transport.get(name)


def test_resolve_config_rejects_self_identified_endpoint_outside_allowlist() -> None:
    """An arbitrary HTTPS endpoint cannot receive the dedicated gateway token."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": "https://attacker.example/v1",
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON": json.dumps(
            ["https://orchestrator.example/v1"]
        ),
        "NOEMA_LLM_API_KEY": "must-not-appear",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL") as excinfo:
        resolve_config(_kv(values))
    assert "must-not-appear" not in str(excinfo.value)


@pytest.mark.parametrize(
    "allowlist_json",
    (
        "",
        "{",
        "{}",
        "[]",
        '["https://orchestrator.example/v1", 1]',
        '["https://orchestrator.example/v1", "https://orchestrator.example/v1"]',
        '["https://*.example/v1"]',
        '["https://ORCHESTRATOR.example/v1"]',
        '["https://orchestrator.example/v1/"]',
        '["https://orchestrator.example:443/v1"]',
        '["https://orchestrator.example:99999/v1"]',
        '["https://éxample.example/v1"]',
        '[" https://orchestrator.example/v1 "]',
        '["https://orchestrator.example./v1"]',
        '["http://127.0.0.1:18080/v1"]',
        '["https://127.0.0.2/v1"]',
        '["https://127.1/v1"]',
        '["https://2130706433/v1"]',
        '["https://0x7f000001/v1"]',
        '["https://0177.0.0.1/v1"]',
        '["https://[0:0:0:0:0:0:0:1]/v1"]',
        '["https://localhost/v1"]',
        '["https://[2001:0db8:0:0:0:0:0:1]/v1"]',
        '["https://orchestrator.example/./v1"]',
        '["https://orchestrator.example/x/../v1"]',
        '["https://api.openai.com/v1"]',
        '["https://%61pi.openai.com/v1"]',
        '["https://api%2eopenai.com/v1"]',
        '["https://[fe80::1%25eth0]/v1"]',
        '["https://orchestrator.example/a\\\\b/v1"]',
        '["https://orchestrator.example\\\\evil.example/v1"]',
        '["https://foo..example/v1"]',
        f'["https://{"a" * 64}.example/v1"]',
        '["https://[::ffff:192.0.2.1]/v1"]',
        '["https://[::ffff:c000:201]/v1"]',
    ),
)
def test_resolve_config_rejects_non_authoritative_endpoint_allowlist(
    allowlist_json: str,
) -> None:
    """Malformed or non-canonical endpoint authority fails before token use."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON": allowlist_json,
        "NOEMA_LLM_API_KEY": "must-not-appear",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL_ALLOWLIST_JSON") as excinfo:
        resolve_config(_kv(values))
    assert "must-not-appear" not in str(excinfo.value)


@pytest.mark.parametrize(
    "base_url",
    (
        " https://orchestrator.example/v1 ",
        "https://ORCHESTRATOR.example/v1",
        "https://orchestrator.example./v1",
        "https://orchestrator.example/v1/",
        "https://orchestrator.example:443/v1",
        "https://éxample.example/v1",
        "https://[2001:0db8:0:0:0:0:0:1]/v1",
        "https://orchestrator.example/./v1",
        "https://orchestrator.example/x/../v1",
        "https://127.1/v1",
        "https://2130706433/v1",
        "https://0x7f000001/v1",
        "https://0177.0.0.1/v1",
        "https://%61pi.openai.com/v1",
        "https://api%2eopenai.com/v1",
        "https://[fe80::1%25eth0]/v1",
        "https://orchestrator.example/a\\b/v1",
        "https://orchestrator.example\\evil.example/v1",
        "https://foo..example/v1",
        f'https://{"a" * 64}.example/v1',
        "https://[::ffff:192.0.2.1]/v1",
        "https://[::ffff:c000:201]/v1",
    ),
)
def test_resolve_config_rejects_noncanonical_selected_endpoint(base_url: str) -> None:
    """Selected endpoint identity is exact rather than silently normalized."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": base_url,
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON": '["https://orchestrator.example/v1"]',
        "NOEMA_LLM_API_KEY": "must-not-appear",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL") as excinfo:
        resolve_config(_kv(values))
    assert "must-not-appear" not in str(excinfo.value)


def test_resolve_config_accepts_exact_nondefault_https_port() -> None:
    """A released endpoint may use an explicitly allowlisted canonical HTTPS port."""
    endpoint = "https://orchestrator.example:8443/v1"
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": endpoint,
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON": json.dumps([endpoint]),
        "NOEMA_LLM_API_KEY": "gateway-token",
    }
    config = resolve_config(_kv(values))
    assert config.base_url == endpoint
    assert config.allowed_base_urls == (endpoint,)


def test_resolve_model_rechecks_manually_constructed_endpoint_membership() -> None:
    """Manual ReviewerConfig construction cannot bypass released endpoint admission."""
    config = ReviewerConfig(
        model_name="orchestrator/free",
        base_url="https://attacker.example/v1",
        api_key="must-not-appear",
        allowed_base_urls=("https://orchestrator.example/v1",),
    )
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL") as excinfo:
        resolve_model(config)
    assert "must-not-appear" not in str(excinfo.value)


def test_resolve_config_prefers_credential_getter() -> None:
    """The KV getter is the source of truth over process env."""
    getter = _kv(
        {
            "NOEMA_LLM_MODEL": "orchestrator/free",
            "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
            "NOEMA_LLM_API_KEY": "secret",
        }
    )
    config = resolve_config(getter)
    assert config == ReviewerConfig(
        model_name="orchestrator/free",
        base_url="https://orchestrator.example/v1",
        api_key="secret",
        allowed_base_urls=("https://orchestrator.example/v1",),
    )


def test_resolve_config_falls_back_to_env(monkeypatch) -> None:
    """Env transport supplies values when the KV getter has none."""
    monkeypatch.setenv("NOEMA_LLM_MODEL", "orchestrator/free")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://x/v1")
    monkeypatch.setenv("NOEMA_LLM_API_URL_ALLOWLIST_JSON", '["https://x/v1"]')
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "k")
    config = resolve_config()
    assert config.model_name == "orchestrator/free"


def test_resolve_config_getter_miss_falls_back_to_env(monkeypatch) -> None:
    """When the KV getter has no value for a key, env transport supplies it."""
    monkeypatch.setenv("NOEMA_LLM_MODEL", "orchestrator/free")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://env/v1")
    monkeypatch.setenv("NOEMA_LLM_API_URL_ALLOWLIST_JSON", '["https://env/v1"]')
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "env-key")
    config = resolve_config(_kv({}))
    assert config.model_name == "orchestrator/free"


def test_resolve_config_raises_when_unconfigured(monkeypatch) -> None:
    """A missing setting raises loudly and names what is missing."""
    for name in (
        "NOEMA_LLM_MODEL",
        "NOEMA_LLM_API_URL",
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON",
        "NOEMA_LLM_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(RuntimeError) as excinfo:
        resolve_config()
    assert "NOEMA_LLM_MODEL" in str(excinfo.value)


def test_resolve_model_builds_openai_model() -> None:
    """resolve_model builds one OpenAI-compatible gateway model from config."""
    config = ReviewerConfig(
        model_name="orchestrator/free",
        base_url="https://x/v1",
        api_key="k",
        allowed_base_urls=("https://x/v1",),
    )
    model = resolve_model(config)
    assert isinstance(model, OpenAIChatModel)


@pytest.mark.parametrize(
    "legacy_control",
    ("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS", "NOEMA_LLM_MAX_RETRIES"),
)
def test_resolve_config_rejects_legacy_model_attempt_controls(legacy_control: str) -> None:
    """Noema-local model-attempt knobs fail closed instead of allocating inference."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        legacy_control: "1",
    }
    with pytest.raises(RuntimeError, match=legacy_control) as excinfo:
        resolve_config(_kv(values))
    assert "primary-key" not in str(excinfo.value)


def test_resolve_config_carries_trusted_zdr_policy() -> None:
    """The workflow-derived request privacy policy is explicit reviewer configuration."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        "NOEMA_LLM_ZDR_ONLY": "true",
    }
    config = resolve_config(_kv(values))
    assert config.zdr_only is True


@pytest.mark.parametrize("raw", ("1", "yes", "TRUE", "private"))
def test_resolve_config_rejects_ambiguous_zdr_policy(raw: str) -> None:
    """Only exact workflow-derived true/false values may control request privacy."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
        "NOEMA_LLM_ZDR_ONLY": raw,
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_ZDR_ONLY"):
        resolve_config(_kv(values))


def test_resolve_config_rejects_complete_leftover_fallback_bundle() -> None:
    """A complete leftover fallback bundle still fails closed."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
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
    monkeypatch.setenv("NOEMA_LLM_MODEL", "orchestrator/free")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://primary.example/v1")
    monkeypatch.setenv(
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON",
        '["https://primary.example/v1"]',
    )
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
        "NOEMA_LLM_MODEL": "orchestrator/free",
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
    (
        "alpha beta",
        "alpha,beta",
        "nvidia-nim/nvidia/llama",
        "openai/gpt-4.1",
        "github-models/openai/gpt-4.1",
    ),
)
def test_resolve_config_rejects_sequential_or_direct_provider_models(model_name: str) -> None:
    """The reviewer accepts only the governed free-pool routing alias."""
    values = {
        "NOEMA_LLM_MODEL": model_name,
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_MODEL"):
        resolve_config(_kv(values))


def test_resolve_config_rejects_legacy_service_alias() -> None:
    """A stale service-name alias must fail closed instead of widening config compatibility."""
    values = {
        "NOEMA_LLM_MODEL": "contextual-orchestrator",
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_MODEL"):
        resolve_config(_kv(values))


@pytest.mark.parametrize(
    "model_name",
    ("orchestrator/auto", "unreviewed-alias"),
)
def test_resolve_config_rejects_every_non_free_routing_alias(model_name: str) -> None:
    """The Python boundary independently rejects any alias that could widen the pool."""
    values = {
        "NOEMA_LLM_MODEL": model_name,
        "NOEMA_LLM_API_URL": "https://primary.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_MODEL"):
        resolve_config(_kv(values))


def test_resolve_config_rejects_plaintext_remote_model_endpoints() -> None:
    """Credential-bearing remote model endpoints must not use plaintext HTTP."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": "http://reviewer-gateway.example/v1",
        "NOEMA_LLM_API_KEY": "primary-key",
    }
    with pytest.raises(RuntimeError, match="NOEMA_LLM_API_URL") as excinfo:
        resolve_config(_kv(values))
    assert "primary-key" not in str(excinfo.value)


def test_resolve_config_rejects_malformed_model_endpoint_with_bounded_error() -> None:
    """Malformed endpoint syntax fails as a named non-secret configuration error."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
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
            model_name="orchestrator/free",
            base_url="http://reviewer-gateway.example/v1",
            api_key="primary-key",
            allowed_base_urls=("http://reviewer-gateway.example/v1",),
        ),
        ReviewerConfig(
            model_name="openai/gpt-4.1",
            base_url="https://primary.example/v1",
            api_key="primary-key",
            allowed_base_urls=("https://primary.example/v1",),
        ),
    ],
)
def test_resolve_model_rejects_manually_constructed_unsafe_config(config: ReviewerConfig) -> None:
    """Injected ReviewerConfig cannot bypass endpoint or routing-alias validation."""
    with pytest.raises(RuntimeError):
        resolve_model(config)


def test_resolve_model_reads_live_config_when_none_is_passed(monkeypatch) -> None:
    """Omitting config still resolves the single gateway model from transport."""
    monkeypatch.setenv("NOEMA_LLM_MODEL", "orchestrator/free")
    monkeypatch.setenv("NOEMA_LLM_API_URL", "https://orchestrator.example/v1")
    monkeypatch.setenv(
        "NOEMA_LLM_API_URL_ALLOWLIST_JSON",
        '["https://orchestrator.example/v1"]',
    )
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "gateway-token")
    model = resolve_model()
    assert isinstance(model, OpenAIChatModel)


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]"])
def test_resolve_config_rejects_loopback_model_endpoint(host: str) -> None:
    """A loopback endpoint cannot enter the released gateway allowlist."""
    expected_url = f"http://{host}:8080/v1"
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": expected_url,
        "NOEMA_LLM_API_KEY": "local-only-key",
    }
    with pytest.raises(RuntimeError, match="loopback endpoint"):
        resolve_config(_kv(values))
