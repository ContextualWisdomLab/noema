"""Contracts for long-running reviewer timeout ownership."""

from noema_reviewer.config import ReviewerConfig, resolve_config


def _kv(values: dict[str, str]):
    """Build a credential getter backed by a dict."""
    return lambda name: values.get(name)


def test_reviewer_config_has_no_elapsed_time_timeout_by_default() -> None:
    """Noema must not terminate a reasoning request merely because wall time elapsed."""
    config = ReviewerConfig(
        model_name="contextual-orchestrator",
        base_url="https://orchestrator.example/v1",
        api_key="gateway-token",
    )

    assert config.request_timeout_seconds is None


def test_resolve_config_keeps_timeout_null_when_operator_did_not_set_one() -> None:
    """Absent timeout configuration delegates request lifetime to the orchestrator/provider end."""
    config = resolve_config(
        _kv(
            {
                "NOEMA_LLM_MODEL": "contextual-orchestrator",
                "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                "NOEMA_LLM_API_KEY": "gateway-token",
            }
        )
    )

    assert config.request_timeout_seconds is None


def test_explicit_operator_timeout_remains_bounded_and_supported() -> None:
    """An explicitly configured administrative deadline remains an opt-in control."""
    config = resolve_config(
        _kv(
            {
                "NOEMA_LLM_MODEL": "contextual-orchestrator",
                "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                "NOEMA_LLM_API_KEY": "gateway-token",
                "NOEMA_LLM_REQUEST_TIMEOUT_SECONDS": "5400",
            }
        )
    )

    assert config.request_timeout_seconds == 5400.0
