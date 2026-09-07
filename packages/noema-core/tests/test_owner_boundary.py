"""DDD fitness tests for the shared Noema runtime package boundary."""

from __future__ import annotations

import noema_core


def test_shared_core_does_not_construct_provider_specific_models() -> None:
    """Model/provider transport construction must remain outside Noema's Shared Kernel."""

    assert not hasattr(noema_core, "build_openai_model")
