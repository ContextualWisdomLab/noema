"""Coverage for evaluated-base authority in published Noema review bodies."""

from noema_reviewer.github_io import render_review_body
from noema_reviewer.models import ReviewVerdict, Verdict


def test_render_review_body_serializes_evaluated_base_sha() -> None:
    """A supplied evaluated base SHA remains visible in the canonical review evidence."""
    head_sha = "a" * 40
    base_sha = "b" * 40
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")

    body = render_review_body(
        verdict,
        head_sha,
        "NOEMA_REVIEW_TOKEN",
        base_sha=base_sha,
    )

    assert f"- Base SHA: `{base_sha}`" in body
