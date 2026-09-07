"""Adapt the reviewed central ``sandboxed_verify`` result into execution evidence.

The central helper is a foreign-owner execution producer. Noema does not copy or
reimplement it; this adapter accepts only a reviewed immutable helper revision,
its machine-readable result marker, and separately captured command stdout and
stderr. The legacy marker by itself therefore remains insufficient authority.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from .claim_evidence import ProducedClaimEvidence, produce_execution_claim_receipt


_RESULT_PREFIX = "SANDBOXED_VERIFY_RESULT "
_TOOL_IDENTITY = "ContextualWisdomLab/.github:scripts/ci/sandboxed_verify.py"
_NonEmptyText = Annotated[str, Field(min_length=1)]


@dataclass(frozen=True)
class _SandboxedVerifyPolicy:
    """Reviewed semantics for one immutable central helper revision."""

    isolation_policy: str


_SUPPORTED_POLICIES = {
    "c9052e607e5f3cc76e73207e7786b21500721b79": _SandboxedVerifyPolicy(
        isolation_policy="workspace-copy+scrubbed-env;os-process-isolation=none"
    )
}


class _SandboxedVerifyMarker(BaseModel):
    """Exact machine-readable marker shape emitted by the reviewed helper."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    allowed_env: tuple[str, ...]
    command: tuple[_NonEmptyText, ...] = Field(min_length=1)
    cwd: _NonEmptyText
    elapsed_seconds: float = Field(ge=0, allow_inf_nan=False)
    evidence_note: str
    exit_code: StrictInt
    network: Literal["default", "required", "not-required"]
    sandbox: _NonEmptyText
    sandboxed: Literal[True]

    @model_validator(mode="after")
    def require_fully_receipted_capabilities(self) -> "_SandboxedVerifyMarker":
        """Reject environment capabilities until their influence is receipt-bound."""
        if self.allowed_env:
            raise ValueError(
                "sandboxed_verify allowed_env capabilities are not yet receipt-bound"
            )
        return self


def _parse_sandboxed_verify_marker(marker: str) -> _SandboxedVerifyMarker:
    """Parse one exact current helper marker and reject non-marker text."""
    if not marker.startswith(_RESULT_PREFIX):
        raise ValueError("sandboxed_verify result marker is missing")
    return _SandboxedVerifyMarker.model_validate_json(marker[len(_RESULT_PREFIX) :])


def produce_sandboxed_verify_execution_claim_receipt(
    *,
    receipt_id: str,
    repository: str,
    head_sha: str,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    claim: str,
    policy_version: str,
    issued_at: datetime,
    expires_at: datetime,
    marker: str,
    command_stdout: bytes | None,
    command_stderr: bytes | None,
    tool_version: str,
) -> ProducedClaimEvidence:
    """Issue one execution receipt from a reviewed helper result and exact streams.

    ``tool_version`` is the immutable commit of the central ``.github`` helper.
    The current reviewed helper copies the repository into a temporary workspace
    and scrubs its environment but launches the command as an ordinary host
    subprocess; its ``--network`` value is explicitly metadata rather than an
    enforced network control. Those limitations are recorded in the receipt
    instead of being promoted to stronger isolation claims.
    """
    if command_stdout is None:
        raise ValueError("sandboxed_verify execution evidence requires stdout capture")
    if command_stderr is None:
        raise ValueError("sandboxed_verify execution evidence requires stderr capture")
    policy = _SUPPORTED_POLICIES.get(tool_version)
    if policy is None:
        raise ValueError("unsupported sandboxed_verify version requires policy review")
    parsed = _parse_sandboxed_verify_marker(marker)
    return produce_execution_claim_receipt(
        receipt_id=receipt_id,
        repository=repository,
        head_sha=head_sha,
        workflow_ref=workflow_ref,
        run_id=run_id,
        run_attempt=run_attempt,
        claim=claim,
        producer_id="sandboxed-verify",
        producer_version=tool_version,
        policy_version=policy_version,
        issued_at=issued_at,
        expires_at=expires_at,
        argv=parsed.command,
        tool_identity=_TOOL_IDENTITY,
        tool_version=tool_version,
        exit_code=parsed.exit_code,
        stdout=command_stdout,
        stderr=command_stderr,
        isolation_policy=policy.isolation_policy,
        network_policy=f"declared:{parsed.network};enforced=false",
    )
