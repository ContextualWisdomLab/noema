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


def test_reviewer_has_no_downstream_inference_timeout_or_retry_policy() -> None:
    """The reviewer delegates inference lifecycle/recovery to contextual-orchestrator."""
    config = resolve_config(
        _kv(
            {
                "NOEMA_LLM_MODEL": "contextual-orchestrator",
                "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                "NOEMA_LLM_API_KEY": "gateway-token",
                # Legacy values must not become decision inputs even when present.
                "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS": "1",
                "NOEMA_LLM_MAX_RETRIES": "999999",
            }
        )
    )
    assert isinstance(config, ReviewerConfig)
    assert config.model_name == FREE_POOL
    assert not hasattr(config, "request_timeout_seconds")
    assert not hasattr(config, "max_retries")

    source = inspect.getsource(resolve_model)
    assert "timeout=None" in source
    assert "max_retries=0" in source
    assert "request_timeout_seconds" not in source


def test_reviewer_config_source_contains_no_bounded_timeout_or_retry_router() -> None:
    """Hand-authored numeric bounds cannot silently re-enter reviewer routing."""
    import noema_reviewer.config as config_module

    source = inspect.getsource(config_module)
    assert "def _bounded_int" not in source
    assert "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS" not in source
    assert "NOEMA_LLM_MAX_RETRIES" not in source
