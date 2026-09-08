"""Tests for adapting the trusted central sandboxed_verify result into receipts."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from noema_reviewer import (
    ExecutionClaimReceipt,
    produce_sandboxed_verify_execution_claim_receipt,
)


CENTRAL_SHA = "c9052e607e5f3cc76e73207e7786b21500721b79"
HEAD = "a" * 40
WORKFLOW = "ContextualWisdomLab/noema/.github/workflows/central-review.yml@" + "b" * 40
ISSUED = datetime(2026, 9, 7, tzinfo=timezone.utc)
EXPIRES = ISSUED + timedelta(hours=1)
CLAIM = "cargo generate-lockfile exited with an unsupported --locked argument."
COMMAND_STDOUT = b""
COMMAND_STDERR = b"error: unexpected argument '--locked' found\n"


def _marker(**overrides: object) -> str:
    """Return one current central sandboxed_verify marker with selected overrides."""
    payload: dict[str, object] = {
        "allowed_env": [],
        "command": ["cargo", "generate-lockfile", "--locked"],
        "cwd": "/tmp/sandboxed-verify/repo",
        "elapsed_seconds": 0.125,
        "evidence_note": "",
        "exit_code": 1,
        "network": "not-required",
        "sandbox": "(removed)",
        "sandboxed": True,
    }
    payload.update(overrides)
    return "SANDBOXED_VERIFY_RESULT " + json.dumps(payload, sort_keys=True)


def _produce(**overrides: object) -> ExecutionClaimReceipt:
    """Produce one execution receipt through the public trusted adapter."""
    values: dict[str, object] = {
        "receipt_id": "execution-sandboxed-verify-1",
        "repository": "ContextualWisdomLab/ConceptWeave",
        "head_sha": HEAD,
        "workflow_ref": WORKFLOW,
        "run_id": 12,
        "run_attempt": 1,
        "claim": CLAIM,
        "policy_version": "review-evidence-v1",
        "issued_at": ISSUED,
        "expires_at": EXPIRES,
        "marker": _marker(),
        "command_stdout": COMMAND_STDOUT,
        "command_stderr": COMMAND_STDERR,
        "tool_version": CENTRAL_SHA,
    }
    values.update(overrides)
    produced = produce_sandboxed_verify_execution_claim_receipt(**values)
    assert isinstance(produced.receipt, ExecutionClaimReceipt)
    return produced.receipt


def test_current_central_marker_becomes_exact_execution_receipt() -> None:
    """The adapter binds command/result/transcripts and conservative runtime policy."""
    receipt = _produce()
    assert receipt.argv == ("cargo", "generate-lockfile", "--locked")
    assert receipt.tool_identity == "ContextualWisdomLab/.github:scripts/ci/sandboxed_verify.py"
    assert receipt.tool_version == CENTRAL_SHA
    assert receipt.producer_id == "sandboxed-verify"
    assert receipt.producer_version == CENTRAL_SHA
    assert receipt.exit_code == 1
    assert receipt.stdout_sha256 == hashlib.sha256(COMMAND_STDOUT).hexdigest()
    assert receipt.stderr_sha256 == hashlib.sha256(COMMAND_STDERR).hexdigest()
    assert receipt.isolation_policy == (
        "workspace-copy+scrubbed-env;os-process-isolation=none"
    )
    assert receipt.network_policy == "declared:not-required;enforced=false"


def test_marker_only_without_exact_command_transcripts_fails_closed() -> None:
    """The legacy marker alone cannot become authenticated execution evidence."""
    with pytest.raises(ValueError, match="stdout capture"):
        _produce(command_stdout=None)
    with pytest.raises(ValueError, match="stderr capture"):
        _produce(command_stderr=None)


def test_unreviewed_sandboxed_verify_version_fails_closed() -> None:
    """Changed helper semantics require a reviewed Noema adapter-policy bump."""
    with pytest.raises(ValueError, match="unsupported sandboxed_verify version"):
        _produce(tool_version="d" * 40)


def test_nonempty_environment_capability_fails_closed_until_receipted() -> None:
    """Environment capabilities cannot silently influence an execution receipt."""
    with pytest.raises(ValueError, match="allowed_env"):
        _produce(marker=_marker(allowed_env=["PRIVATE_INDEX_TOKEN"]))


@pytest.mark.parametrize(
    "marker",
    [
        "not-a-result",
        "SANDBOXED_VERIFY_RESULT []",
        _marker(sandboxed=False),
        _marker(command=[]),
        _marker(network="disabled"),
        _marker(exit_code=True),
        _marker(elapsed_seconds=float("inf")),
    ],
)
def test_malformed_or_overclaiming_marker_fails_closed(marker: str) -> None:
    """Only the reviewed current central marker shape can issue execution authority."""
    with pytest.raises((ValueError, ValidationError)):
        _produce(marker=marker)


def test_extra_marker_field_fails_closed() -> None:
    """Central marker expansion is a versioned contract change, not implicit authority."""
    with pytest.raises(ValidationError):
        _produce(marker=_marker(new_semantic_field="unreviewed"))
