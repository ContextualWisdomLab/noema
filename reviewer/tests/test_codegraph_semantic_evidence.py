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


def test_split_no_relevant_code_is_missing_semantic_evidence() -> None:
    """Whitespace cannot disguise CodeGraph's explicit empty-result response."""
    reasons = missing_evidence(
        _manifest("## codegraph explore\nNo relevant code\nfound for changed files")
    )

    assert reasons == ["CodeGraph semantic query returned no relevant code"]


def test_irregular_whitespace_no_relevant_code_is_missing_semantic_evidence() -> None:
    """Tabs, repeated spaces, and Unicode spacing cannot disguise an empty result."""
    reasons = missing_evidence(
        _manifest("## codegraph explore\nNo   relevant\tcode\u00a0found for changed files")
    )

    assert reasons == ["CodeGraph semantic query returned no relevant code"]


def test_multiple_explore_markers_are_ambiguous_provenance() -> None:
    """Only the wrapper-owned explore marker may define semantic evidence provenance."""
    reasons = missing_evidence(
        _manifest(
            "## codegraph explore\n"
            "No relevant code found for stale warmup query\n"
            "## codegraph explore\n"
            "commercialReadiness -> computeCommercialReadiness"
        )
    )

    assert reasons == ["CodeGraph semantic query has ambiguous provenance"]


def test_annotation_cannot_split_final_no_relevant_result() -> None:
    """Non-semantic headings cannot disguise the final empty-result marker."""
    reasons = missing_evidence(
        _manifest(
            "## codegraph explore\n"
            "No relevant code\n"
            "## codegraph status\n"
            "found for changed files"
        )
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


def test_labelled_status_banner_is_not_semantic_evidence() -> None:
    """The provenance wrapper must not turn a status-only explore stdout into review context."""
    reasons = missing_evidence(
        _manifest(
            "initialized\nIndex is up to date\n"
            "## codegraph explore\n"
            "Index is up to date"
        )
    )

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

    assert reasons == ["CodeGraph semantic query has ambiguous provenance"]


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


def test_spoofed_workflow_annotation_alone_fails_closed() -> None:
    """Workflow command annotations cannot impersonate semantic explore output."""
    reasons = missing_evidence(
        _manifest(
            "initialized\n## codegraph explore\n"
            "::warning file=x.py,line=1::commercialReadiness"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_truncation_and_workflow_annotations_together_fail_closed() -> None:
    """Multiple annotation-only lines remain non-semantic after bounded truncation."""
    reasons = missing_evidence(
        _manifest(
            "## codegraph explore\n"
            "[truncated unknown characters]\n"
            "::notice::CodeGraph output retained"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_truncation_and_status_heading_together_fail_closed() -> None:
    """A later lifecycle heading cannot promote truncated output to semantic evidence."""
    reasons = missing_evidence(
        _manifest(
            "## codegraph explore\n"
            "[truncated 417 characters]\n"
            "## codegraph status"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]


def test_control_or_punctuation_only_output_fails_closed() -> None:
    """ANSI controls and punctuation do not constitute retained semantic bytes."""
    reasons = missing_evidence(_manifest("## codegraph explore\n\x1b[0m\n."))

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
