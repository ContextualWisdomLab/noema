"""Coverage contract for workflow-derived local CodeGraph image identities."""

from noema_reviewer import sandbox


def test_verified_image_reference_accepts_scanned_local_image_id(monkeypatch) -> None:
    """The reviewer must accept the immutable local ID emitted by the trusted preparer."""
    local_image = f"sha256:{'b' * 64}"
    monkeypatch.setenv("NOEMA_CODEGRAPH_SANDBOX_IMAGE", local_image)

    assert sandbox._verified_image_reference() == local_image
