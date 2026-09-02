"""Executable no-heuristics contracts for Noema review execution."""

from __future__ import annotations

import pytest

from noema_reviewer.config import ReviewerConfig, resolve_config
from noema_reviewer.gating import (
    dependency_findings_as_review,
    security_findings_as_review,
)
from noema_reviewer.manifest import DependencyFinding, ReviewManifest, SecurityFinding
from noema_reviewer.models import Finding, ReviewVerdict, Severity, Verdict


def _kv(values: dict[str, str]):
    """Build the credential getter used by production configuration tests."""
    return lambda name: values.get(name)


def _base_values(**extra: str) -> dict[str, str]:
    """Return a complete exact free-pool gateway configuration."""
    values = {
        "NOEMA_LLM_MODEL": "orchestrator/free",
        "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
        "NOEMA_LLM_API_KEY": "gateway-token",
    }
    values.update(extra)
    return values


def test_exact_free_pool_and_private_zdr_are_first_class_configuration() -> None:
    """The reviewer preserves exact free-pool identity and trusted ZDR policy."""
    config = resolve_config(_kv(_base_values(NOEMA_LLM_ZDR_ONLY="true")))
    assert config == ReviewerConfig(
        model_name="orchestrator/free",
        base_url="https://orchestrator.example/v1",
        api_key="gateway-token",
        zdr_only=True,
    )


def test_generic_orchestrator_alias_is_not_an_accepted_production_pool() -> None:
    """A generic gateway alias cannot silently select a non-free pool."""
    with pytest.raises(RuntimeError, match="orchestrator/free"):
        resolve_config(
            _kv(
                {
                    "NOEMA_LLM_MODEL": "contextual-orchestrator",
                    "NOEMA_LLM_API_URL": "https://orchestrator.example/v1",
                    "NOEMA_LLM_API_KEY": "gateway-token",
                }
            )
        )


@pytest.mark.parametrize(
    "legacy_control",
    ("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS", "NOEMA_LLM_MAX_RETRIES"),
)
def test_repository_authored_model_attempt_controls_fail_closed(legacy_control: str) -> None:
    """Noema cannot reintroduce hand-selected model timeout/retry allocation."""
    with pytest.raises(RuntimeError, match=legacy_control):
        resolve_config(_kv(_base_values(**{legacy_control: "1"})))


def test_approval_cannot_carry_any_unresolved_finding_regardless_of_label() -> None:
    """Severity labels remain evidence metadata, never a local admission threshold."""
    with pytest.raises(ValueError, match="approval verdict cannot contain findings"):
        ReviewVerdict(
            verdict=Verdict.APPROVE,
            summary="not admissible",
            findings=[
                Finding(
                    severity=Severity.LOW,
                    path="src/a.py",
                    evidence="scanner finding",
                    recommendation="remediate the finding",
                )
            ],
        )


def test_all_unresolved_dependency_findings_are_review_findings() -> None:
    """No local MEDIUM cutoff may hide a lower-labelled unresolved dependency finding."""
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/example",
        pr_number=1,
        dependency_findings=[
            DependencyFinding(
                tool="scanner",
                identifier="CVE-example",
                package_name="example-package",
                installed_version="1.0.0",
                fixed_version="1.0.1",
                severity=Severity.LOW,
                resolved=False,
            )
        ],
    )
    findings = dependency_findings_as_review(manifest)
    assert [finding.path for finding in findings] == ["example-package"]


def test_all_current_security_findings_are_review_findings() -> None:
    """No local MEDIUM cutoff may suppress a current scanner finding."""
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/example",
        pr_number=1,
        security_findings=[
            SecurityFinding(
                tool="scanner",
                identifier="rule-example",
                severity=Severity.LOW,
                message="observed issue",
                path="src/a.py",
            )
        ],
    )
    findings = security_findings_as_review(manifest)
    assert [finding.path for finding in findings] == ["src/a.py"]


def test_review_verdict_has_no_uncalibrated_confidence_field() -> None:
    """Noema does not publish categorical uncertainty without a calibration model."""
    verdict = ReviewVerdict(verdict=Verdict.BLOCKED, summary="missing evidence")
    assert "confidence" not in verdict.model_dump()
