"""Security contract for the CodeGraph sandbox runtime substrate."""

from pathlib import Path

from noema_reviewer import sandbox


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
REVIEWER_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "reviewer-ci.yml"
CENTRAL_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "central-review.yml"


def test_codegraph_sandbox_uses_scanned_non_openssl_runtime_substrate() -> None:
    """Reviewer workflows must scan java-base and invoke the bundled Node explicitly."""
    expected_source = "gcr.io/distroless/java-base-debian13:nonroot"
    expected_repository = "gcr.io/distroless/java-base-debian13"

    for workflow_path in (REVIEWER_WORKFLOW, CENTRAL_WORKFLOW):
        workflow = workflow_path.read_text(encoding="utf-8")
        assert f"NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE: {expected_source}" in workflow
        assert f"{expected_repository}@sha256:" in workflow
        assert "gcr.io/distroless/nodejs24-debian13" not in workflow
        assert "trivy image" in workflow
        assert "--ignore-unfixed" in workflow
        assert "--severity MEDIUM,HIGH,CRITICAL" in workflow

    assert sandbox.TRUSTED_CODEGRAPH_IMAGE_REPOSITORY == expected_repository
    source = (REPOSITORY_ROOT / "reviewer" / "noema_reviewer" / "sandbox.py").read_text(
        encoding="utf-8"
    )
    assert '"/tooling/node_modules/@colbymchenry/codegraph-linux-x64/node"' in source
    assert "image,\n            BUNDLED_CODEGRAPH_NODE," in source
