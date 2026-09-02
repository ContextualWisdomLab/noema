"""Regression contracts for Noema's orchestrator-only inference boundary."""

from __future__ import annotations

import inspect

import pytest

from noema_reviewer.config import ReviewerConfig, resolve_config, resolve_model


FREE_POOL = "orchestrator/free"


def _kv(values: dict[str, str]):
    """Build a credential getter backed by a dict."""
    return lambda name: values.get(name)


def test_reviewer_accepts_only_the_governed_free_pool_alias() -> None:
    """Noema cannot select auto, the gateway default alias, or a direct model."""
    base = {
        "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
        "NOEMA_LLM_API_KEY": "gateway-token",
    }
    config = resolve_config(_kv({**base, "NOEMA_LLM_MODEL": FREE_POOL}))
    assert config.model_name == FREE_POOL

    for model_name in ("contextual-orchestrator", "orchestrator/auto", "model-x"):
        with pytest.raises(RuntimeError, match="NOEMA_LLM_MODEL"):
            resolve_config(_kv({**base, "NOEMA_LLM_MODEL": model_name}))


def test_reviewer_has_no_downstream_inference_timeout_or_retry_policy() -> None:
    """The reviewer delegates inference lifecycle/recovery to contextual-orchestrator."""
    config = resolve_config(
        _kv(
            {
                "NOEMA_LLM_MODEL": FREE_POOL,
                "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                "NOEMA_LLM_API_KEY": "gateway-token",
                # Legacy values must not become decision inputs even when present.
                "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS": "1",
                "NOEMA_LLM_MAX_RETRIES": "999999",
            }
        )
    )
    assert isinstance(config, ReviewerConfig)
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
