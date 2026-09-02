"""Regression contracts for Noema's orchestrator-only inference boundary."""

from __future__ import annotations

import inspect

import pytest

from noema_reviewer.config import ReviewerConfig, resolve_config, resolve_model


FREE_POOL = "orchestrator/free"


def _kv(values: dict[str, str]):
    """Build a credential getter backed by a dict."""
    return lambda name: values.get(name)


def test_reviewer_canonicalizes_only_the_legacy_service_alias() -> None:
    """The historical service-name value cannot broaden Noema beyond the free pool."""
    base = {
        "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
        "NOEMA_LLM_API_KEY": "gateway-token",
    }
    for model_name in (FREE_POOL, "contextual-orchestrator"):
        config = resolve_config(_kv({**base, "NOEMA_LLM_MODEL": model_name}))
        assert config.model_name == FREE_POOL


@pytest.mark.parametrize("model_name", ("orchestrator/auto", "model-x"))
def test_reviewer_rejects_aliases_that_can_widen_routing(model_name: str) -> None:
    """Compatibility normalization never turns arbitrary aliases into authority."""
    with pytest.raises(RuntimeError, match="NOEMA_LLM_MODEL"):
        resolve_config(
            _kv(
                {
                    "NOEMA_LLM_MODEL": model_name,
                    "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                    "NOEMA_LLM_API_KEY": "gateway-token",
                }
            )
        )


@pytest.mark.parametrize(
    "legacy_control",
    ("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS", "NOEMA_LLM_MAX_RETRIES"),
)
def test_reviewer_rejects_repository_authored_model_attempt_controls(
    legacy_control: str,
) -> None:
    """Noema cannot allocate model attempts through local timeout/retry settings."""
    with pytest.raises(RuntimeError, match=legacy_control):
        resolve_config(
            _kv(
                {
                    "NOEMA_LLM_MODEL": FREE_POOL,
                    "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                    "NOEMA_LLM_API_KEY": "gateway-token",
                    legacy_control: "1",
                }
            )
        )


def test_reviewer_model_client_disables_sdk_retry_allocation() -> None:
    """The OpenAI-compatible client delegates recovery and routing upstream."""
    source = inspect.getsource(resolve_model)
    assert "timeout=None" in source
    assert "max_retries=0" in source
    assert "request_timeout_seconds" not in source


def test_reviewer_config_has_no_numeric_attempt_router() -> None:
    """Legacy names may exist only as fail-closed guards, never numeric policy inputs."""
    import noema_reviewer.config as config_module

    source = inspect.getsource(config_module)
    assert "def _bounded_int" not in source
    assert "int(_read(\"NOEMA_LLM_REQUEST_TIMEOUT_SECONDS\"" not in source
    assert "int(_read(\"NOEMA_LLM_MAX_RETRIES\"" not in source
    assert "_reject_legacy_attempt_controls" in source


def test_resolved_config_remains_plain_gateway_configuration() -> None:
    """A valid config contains gateway identity/privacy policy but no attempt budget."""
    config = resolve_config(
        _kv(
            {
                "NOEMA_LLM_MODEL": FREE_POOL,
                "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                "NOEMA_LLM_API_KEY": "gateway-token",
                "NOEMA_LLM_ZDR_ONLY": "true",
            }
        )
    )
    assert isinstance(config, ReviewerConfig)
    assert config.model_name == FREE_POOL
    assert config.zdr_only is True
    assert not hasattr(config, "request_timeout_seconds")
    assert not hasattr(config, "max_retries")
