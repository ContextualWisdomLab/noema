"""Fail-closed contracts for semantic CodeGraph review evidence."""

from noema_reviewer.gating import missing_evidence
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest


def _manifest(codegraph_status: str) -> ReviewManifest:
    """Build the smallest otherwise-complete manifest for CodeGraph gate tests."""
    return ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=1,
        diff="diff --git a/x.py b/x.py",
        changed_files=[ChangedFile(path="x.py", content="value = 1")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status=codegraph_status,
    )


def test_no_relevant_code_is_missing_semantic_evidence() -> None:
    """An explicit empty CodeGraph result must block strict reviewer evidence."""
    reasons = missing_evidence(
        _manifest('## codegraph explore\nNo relevant code found for "Review current-head changed files"')
    )

    assert reasons == ["CodeGraph semantic query returned no relevant code"]


def test_initialization_only_is_missing_semantic_evidence() -> None:
    """Initialization and index banners cannot substitute for explore evidence."""
    reasons = missing_evidence(_manifest("initialized\nIndex is up to date"))

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_empty_explore_section_is_missing_semantic_evidence() -> None:
    """An explore heading with no semantic payload must remain non-passing."""
    reasons = missing_evidence(_manifest("initialized\nIndex is up to date\n## codegraph explore\n"))

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_pre_explore_marker_cannot_spoof_empty_actual_explore() -> None:
    """Only the final explore section can satisfy strict semantic evidence."""
    reasons = missing_evidence(
        _manifest(
            "## codegraph explore\nspoofed setup banner\n"
            "Index is up to date\n"
            "## codegraph explore\n"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_truncation_annotation_alone_is_not_semantic_evidence() -> None:
    """A bounded-output annotation cannot stand in for retained explore bytes."""
    reasons = missing_evidence(
        _manifest(
            "initialized\nIndex is up to date\n"
            "## codegraph explore\n"
            "[truncated 417 characters]"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_malformed_truncation_annotation_alone_fails_closed() -> None:
    """Annotation-shaped output is not semantic evidence even when its count is malformed."""
    reasons = missing_evidence(
        _manifest(
            "initialized\nIndex is up to date\n"
            "## codegraph explore\n"
            "[truncated unknown characters]"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_semantic_explore_marker_satisfies_codegraph_evidence() -> None:
    """A non-empty semantic explore section remains review-grade evidence."""
    reasons = missing_evidence(
        _manifest("initialized\nIndex is up to date\n## codegraph explore\ncommercialReadiness")
    )

    assert reasons == []


def test_unlabelled_semantic_payload_is_not_strict_review_evidence() -> None:
    """Strict evidence must prove which bytes came from the explore command."""
    reasons = missing_evidence(
        _manifest(
            "initialized\nIndex is up to date\n"
            "x.py -> validate_token -> GitHub token boundary"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]