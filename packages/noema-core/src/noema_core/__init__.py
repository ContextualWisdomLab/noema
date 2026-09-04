"""noema-core: shared PydanticAI Agent-construction wiring for Noema consumers.

See :mod:`noema_core.agent` for the provider-neutral agent factory and shared
persona fragment. Provider transport and credential wiring stay outside this
Shared Kernel. See ``docs/adr/0014-shared-noema-core-package.md`` in
``ContextualWisdomLab/noema`` for the ownership boundary.
"""

from __future__ import annotations

from .agent import NOEMA_PERSONA, build_agent

__all__ = ["NOEMA_PERSONA", "build_agent"]
