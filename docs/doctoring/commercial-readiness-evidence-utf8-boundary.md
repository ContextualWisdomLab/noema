# Commercial-readiness evidence UTF-8 boundary

## Decision

Noema treats the dry-run commercial-readiness artifact as an exact byte-level protocol input. The normalizer therefore decodes the bounded `Buffer` with a single reusable `TextDecoder("utf-8", { fatal: true })` before duplicate-key scanning or `JSON.parse`. A malformed UTF-8 sequence throws and is converted into the fixed `dry_run_report_invalid` report; replacement-character decoding is not accepted.

This preserves the distinction between the bytes produced by the no-write maintenance run and the canonical evidence retained for due diligence. Without fatal decoding, JavaScript replacement semantics could convert malformed wire bytes to U+FFFD, after which an invalid byte sequence located in an allowlist-dropped field could be silently accepted as valid evidence.

## Standards rationale

RFC 8259 requires JSON exchanged between systems outside a closed ecosystem to use UTF-8. The WHATWG Encoding Living Standard defines a fatal decoder mode that returns an error instead of inserting U+FFFD, and its `TextDecoder` API throws a `TypeError` when fatal decoding encounters an error. Node.js 24 exposes this WHATWG-compatible API globally and documents the same failure behavior.

The implementation does not claim formal conformance certification. It applies the interoperable UTF-8 and fail-closed decoding requirements that are relevant to this evidence boundary.

## Verification contract

The regression suite supplies malformed UTF-8 inside a syntactically valid, unknown JSON member. The expected result is fixed invalid evidence, proving that allowlist dropping cannot hide malformed source bytes. A companion case supplies valid Korean and punctuation text in an allowlisted reason detail and requires exact preservation, proving that the gate rejects malformed encoding rather than non-ASCII content.

## APA 7th references

Bray, T. (2017). *The JavaScript Object Notation (JSON) data interchange format* (RFC 8259). Internet Engineering Task Force. https://doi.org/10.17487/RFC8259

Node.js contributors. (2026). *Util: Class TextDecoder* (Node.js v24.11.0 documentation). Retrieved August 4, 2026, from https://nodejs.org/download/release/v24.11.0/docs/api/util.html

WHATWG. (2026, May 21). *Encoding* (Living Standard). Retrieved August 4, 2026, from https://encoding.spec.whatwg.org/
