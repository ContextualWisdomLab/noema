"""Primary diff-header path regressions for patch quarantine."""

from __future__ import annotations

import pytest

from noema_reviewer.patch_validation import inspect_patch_bytes


def test_unquoted_space_header_rejects_distinct_equal_length_paths() -> None:
    """Fallback parsing cannot pair different unquoted repository paths."""
    patch_bytes = (
        b"diff --git a/src/a b.ts b/src/c d.ts\n"
        b"--- a/src/a b.ts\n"
        b"+++ b/src/c d.ts\n"
        b"@@ -1 +1 @@\n-old\n+new\n"
    )

    with pytest.raises(ValueError, match="malformed diff header"):
        inspect_patch_bytes(patch_bytes)
