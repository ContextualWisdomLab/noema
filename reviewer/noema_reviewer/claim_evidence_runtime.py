"""Connect trusted claim-evidence producers to model admission and publication."""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from .claim_evidence import (
    ClaimEvidenceReceipt,
    EvidenceKind,
    VerifiedClaimEvidenceIndex,
    produce_claim_evidence_manifest,
    verify_claim_evidence_manifest,
)
from .claim_evidence_reference import admit_claim_evidence_reference
from .manifest import ReviewManifest
from .models import ReviewVerdict
from .source_claim_evidence import produce_source_claim_receipt


MAX_SOURCE_RECEIPTS = 40
MAX_SOURCE_FILE_BYTES = 1_000_000
MAX_SOURCE_CLAIM_CHARS = 300
TRUSTED_CLAIM_EVIDENCE_PRODUCERS = {
    "changed-source-map": EvidenceKind.SOURCE,
    "sandboxed-verify": EvidenceKind.EXECUTION,
    "trusted-research-retrieval": EvidenceKind.RESEARCH,
}


def _safe_source_file(source_root: Path, relative_path: str) -> Path | None:
    """Return one exact regular checkout file without following symlinks."""
    if (
        not relative_path
        or Path(relative_path).is_absolute()
        or any(part in {"", ".", ".."} for part in relative_path.split("/"))
    ):
        return None
    root = source_root.resolve(strict=True)
    candidate = root.joinpath(*relative_path.split("/"))
    try:
        if candidate.is_symlink() or not candidate.is_file():
            return None
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
        if resolved.stat().st_size > MAX_SOURCE_FILE_BYTES:
            return None
    except (OSError, ValueError):
        return None
    return resolved


def produce_current_head_source_manifest(
    manifest: ReviewManifest,
    *,
    source_root: Path,
    workflow_ref: str,
    run_id: int,
    run_attempt: int,
    issued_at: datetime,
    expires_at: datetime,
    max_receipts: int = MAX_SOURCE_RECEIPTS,
) -> bytes:
    """Produce bounded exact-line receipts from the already verified head checkout."""
    if max_receipts < 1 or max_receipts > MAX_SOURCE_RECEIPTS:
        raise ValueError("source receipt limit must be within the reviewed bound")
    entries: list[tuple[str, object]] = []
    seen_receipts: set[str] = set()
    for changed in manifest.changed_files:
        source_file = _safe_source_file(source_root, changed.path)
        if source_file is None:
            continue
        try:
            source_lines = source_file.read_bytes().splitlines(keepends=True)
        except OSError:
            continue
        for line_number, source_line in enumerate(source_lines, start=1):
            try:
                claim = source_line.rstrip(b"\r\n").decode("utf-8")
            except UnicodeDecodeError:
                continue
            if (
                not claim.strip()
                or len(claim) > MAX_SOURCE_CLAIM_CHARS
                or not claim.isprintable()
            ):
                continue
            receipt_hash = hashlib.sha256(
                changed.path.encode("utf-8")
                + b"\0"
                + str(line_number).encode("ascii")
                + b"\0"
                + source_line
            ).hexdigest()[:24]
            receipt_id = f"source-{receipt_hash}"
            if receipt_id in seen_receipts:
                continue
            produced = produce_source_claim_receipt(
                receipt_id=receipt_id,
                repository=manifest.repo,
                head_sha=manifest.head_sha,
                workflow_ref=workflow_ref,
                run_id=run_id,
                run_attempt=run_attempt,
                claim=claim,
                producer_id="changed-source-map",
                producer_version="v1",
                policy_version="review-evidence-v1",
                issued_at=issued_at,
                expires_at=expires_at,
                source_path=changed.path,
                source_line=line_number,
                source_line_bytes=source_line,
            )
            entries.append((claim, produced))
            seen_receipts.add(receipt_id)
            if len(entries) == max_receipts:
                return produce_claim_evidence_manifest(entries)
    return produce_claim_evidence_manifest(entries)


def verify_claim_evidence_file(
    path: Path,
    *,
    expected_manifest_sha256: str,
    expected_repository: str,
    expected_head_sha: str,
    expected_workflow_ref: str,
    expected_run_id: int,
    expected_run_attempt: int,
) -> VerifiedClaimEvidenceIndex:
    """Read and verify one workflow-authenticated manifest using reviewed policy."""
    if path.is_symlink() or not path.is_file():
        raise ValueError("claim evidence manifest path is not a regular file")
    return verify_claim_evidence_manifest(
        path.read_bytes(),
        expected_manifest_sha256=expected_manifest_sha256,
        expected_repository=expected_repository,
        expected_head_sha=expected_head_sha,
        expected_workflow_ref=expected_workflow_ref,
        expected_run_id=expected_run_id,
        expected_run_attempt=expected_run_attempt,
        expected_producers=TRUSTED_CLAIM_EVIDENCE_PRODUCERS,
    )


def prompt_claim_evidence_references(
    trusted_index: VerifiedClaimEvidenceIndex | None,
) -> list[str]:
    """Return exact producer-authenticated references safe to expose to the model."""
    if trusted_index is None:
        return []
    return [
        f"{trusted_index.claims[receipt_id]} [receipt:{receipt_id}]"
        for receipt_id in sorted(trusted_index.receipts)
    ]


def admit_review_verdict_evidence(
    verdict: ReviewVerdict,
    *,
    trusted_index: VerifiedClaimEvidenceIndex | None,
    admitted_at: datetime,
) -> tuple[ClaimEvidenceReceipt, ...]:
    """Admit every model finding before deterministic gates or publication."""
    if not verdict.findings:
        return ()
    if trusted_index is None:
        raise ValueError("model finding evidence requires a verified receipt manifest")
    admitted: list[ClaimEvidenceReceipt] = []
    for finding in verdict.findings:
        _, receipt_id = _parse_reference(finding.evidence)
        receipt = trusted_index.receipts.get(receipt_id)
        if receipt is None:
            raise ValueError("claim evidence receipt is missing from trusted manifest")
        admitted.append(
            admit_claim_evidence_reference(
                finding.evidence,
                trusted_index=trusted_index,
                admitted_at=admitted_at,
                required_kind=receipt.evidence_kind,
            )
        )
    return tuple(admitted)


def _parse_reference(reference: str) -> tuple[str, str]:
    """Parse through the canonical reference port without duplicating its grammar."""
    from .claim_evidence_reference import parse_claim_evidence_reference

    return parse_claim_evidence_reference(reference)
