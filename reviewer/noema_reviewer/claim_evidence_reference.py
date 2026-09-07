"""Bind model-visible receipt citations to the trusted claim-evidence admission port.

The model controls only one canonical text reference ending in ``[receipt:<id>]``.
The caller still owns the required evidence kind and the verified out-of-band
manifest index; this module performs no provider, tool, or semantic inference.
"""

from __future__ import annotations

import re
from datetime import datetime

from .claim_evidence import (
    ClaimEvidenceReceipt,
    EvidenceKind,
    VerifiedClaimEvidenceIndex,
    admit_claim_evidence,
)


_RECEIPT_REFERENCE_RE = re.compile(
    r"^(?P<claim>\S(?:[^\r\n]*\S)?) \[receipt:(?P<receipt_id>[a-z0-9][a-z0-9._-]{0,79})\]$"
)


def parse_claim_evidence_reference(reference: str) -> tuple[str, str]:
    """Return exact claim text and receipt ID from one canonical citation.

    The syntax deliberately admits one single-line claim, one ASCII separator,
    and one lowercase trailing receipt marker. It does not normalize whitespace,
    case, synonyms, tool names, or evidence kinds because those transformations
    would change the claim bytes authenticated by the trusted producer.

    Raises:
        TypeError: If the model output is not a string.
        ValueError: If the reference is missing, ambiguous, or noncanonical.
    """
    if not isinstance(reference, str):
        raise TypeError("claim evidence reference must be a string")
    match = _RECEIPT_REFERENCE_RE.fullmatch(reference)
    if match is None:
        raise ValueError(
            "claim evidence reference must use canonical '<claim> [receipt:<id>]' syntax"
        )
    claim = match.group("claim")
    if "[receipt:" in claim:
        raise ValueError("claim evidence reference must contain exactly one receipt marker")
    return claim, match.group("receipt_id")


def admit_claim_evidence_reference(
    reference: str,
    *,
    trusted_index: VerifiedClaimEvidenceIndex,
    admitted_at: datetime,
    required_kind: EvidenceKind,
) -> ClaimEvidenceReceipt:
    """Admit one canonical model citation through caller-owned evidence authority.

    ``required_kind`` remains caller policy. The model-visible reference carries
    no authoritative evidence-kind field and cannot construct or modify the
    verified manifest index.
    """
    claim, receipt_id = parse_claim_evidence_reference(reference)
    return admit_claim_evidence(
        receipt_id,
        trusted_index=trusted_index,
        claim=claim,
        admitted_at=admitted_at,
        required_kind=required_kind,
    )
