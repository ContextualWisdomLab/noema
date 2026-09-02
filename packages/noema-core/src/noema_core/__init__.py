"""noema-core: shared PydanticAI Agent-construction wiring for Noema consumers.

See :mod:`noema_core.agent` for the two exported functions and the shared
persona fragment. Scope is deliberately narrow — see
``docs/adr/0012-shared-noema-core-package.md`` in
``ContextualWisdomLab/noema`` for what this package owns and what it
explicitly excludes.
"""

from __future__ import annotations

from .agent import NOEMA_PERSONA, build_agent, build_openai_model

__all__ = ["NOEMA_PERSONA", "build_agent", "build_openai_model"]
