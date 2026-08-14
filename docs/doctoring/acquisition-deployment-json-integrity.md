# Acquisition deployment JSON integrity

## Decision

Noema treats deployment diligence evidence as an exact evidence protocol, not as permissive application JSON. After bounded no-follow file reads and fatal UTF-8 decoding, every JSON object name must be unique after JSON escape decoding before repository identity, deployment identity, production-governance state, verification-receipt fields, or retained Sigstore bundle structure can influence acquisition evaluation.

The rule applies to ordinary JSON evidence and independently to each JSONL record accepted for retained attestation bundles. A document such as `{"repository":"attacker/example","reposit\u006fry":"ContextualWisdomLab/noema"}` is rejected rather than allowing the JavaScript parser's later member to replace the earlier value.

## Rationale

RFC 8259 §4 states that object member names should be unique and explains that receiver behavior is unpredictable when names are duplicated. Parser-specific last-key-wins behavior is unsuitable for buyer-facing diligence evidence because two consumers could authenticate the same bytes while deriving different semantic claims. Noema therefore applies its existing bounded decoded-key scanner before `JSON.parse` and fails closed on any duplicate decoded member name.

This hardening does not make a Sigstore bundle cryptographically valid and does not substitute for `gh attestation verify`. It only prevents structurally ambiguous bytes from reaching the existing acquisition evidence evaluator. Cryptographic verification, protected production governance, immutable release identity, legal rights, customer operation, and transfer evidence remain separate gates.

## Verification contract

Regression coverage uses realistic passing acquisition fixtures and then introduces two ambiguities that were previously normalized by `JSON.parse`:

1. deployment evidence carries contradictory escape-equivalent `repository` members while the verification receipt is correctly rebound to the exact ambiguous deployment bytes;
2. a retained attestation bundle carries contradictory escape-equivalent `mediaType` members, with the later value matching the expected Sigstore bundle media type.

Both inputs must terminate as `deployment_evidence_collection_failed` with duplicate-decoded-key evidence before diligence evaluation. Valid exact-byte fixtures, malformed UTF-8 rejection, symlink-swap resistance, and JSONL bundle support remain unchanged.

## APA 7th reference

Bray, T. (Ed.). (2017). *The JavaScript Object Notation (JSON) Data Interchange Format* (RFC 8259). RFC Editor. https://doi.org/10.17487/RFC8259
