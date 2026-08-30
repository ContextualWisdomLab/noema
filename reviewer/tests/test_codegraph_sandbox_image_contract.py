"""Security contract for the CodeGraph sandbox runtime substrate."""

from pathlib import Path

from noema_reviewer import sandbox


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
REVIEWER_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "reviewer-ci.yml"
CENTRAL_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "central-review.yml"


def _yaml_run_blocks(workflow: str) -> list[str]:
    """Return literal YAML run-block bodies without matching neighboring steps."""
    lines = workflow.splitlines()
    blocks: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.lstrip() != "run: |":
            index += 1
            continue
        run_indent = len(line) - len(line.lstrip())
        body: list[str] = []
        index += 1
        while index < len(lines):
            candidate = lines[index]
            candidate_indent = len(candidate) - len(candidate.lstrip())
            if candidate.strip() and candidate_indent <= run_indent:
                break
            body.append(candidate)
            index += 1
        blocks.append("\n".join(body))
    return blocks


def test_codegraph_sandbox_uses_scanned_non_openssl_runtime_substrate() -> None:
    """Reviewer workflows must scan java-base and invoke the bundled Node explicitly."""
    expected_source = "gcr.io/distroless/java-base-debian13:nonroot"
    expected_repository = "gcr.io/distroless/java-base-debian13"

    for workflow_path in (REVIEWER_WORKFLOW, CENTRAL_WORKFLOW):
        workflow = workflow_path.read_text(encoding="utf-8")
        assert f"NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE: {expected_source}" in workflow
        assert f"{expected_repository}@sha256:" in workflow
        assert "gcr.io/distroless/nodejs24-debian13" not in workflow
        trivy_run_blocks = [
            block for block in _yaml_run_blocks(workflow) if "trivy image" in block
        ]
        assert len(trivy_run_blocks) == 1
        trivy_run_block = trivy_run_blocks[0]
        assert "--exit-code 1" in trivy_run_block
        assert "--ignore-unfixed" in trivy_run_block
        assert "--severity MEDIUM,HIGH,CRITICAL" in trivy_run_block

    assert sandbox.TRUSTED_CODEGRAPH_IMAGE_REPOSITORY == expected_repository
    source = (REPOSITORY_ROOT / "reviewer" / "noema_reviewer" / "sandbox.py").read_text(
        encoding="utf-8"
    )
    assert '"/tooling/node_modules/@colbymchenry/codegraph-linux-x64/node"' in source
    assert "image,\n            BUNDLED_CODEGRAPH_NODE," in source
