"""Module entry so ``python -m noema_reviewer`` runs the CLI."""

from __future__ import annotations

from .cli import main


if __name__ == "__main__":  # pragma: no cover - thin module shim
    raise SystemExit(main())
