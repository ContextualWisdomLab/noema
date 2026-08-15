# Release evidence timestamp canonicalization

## Scope

This note documents the standards basis for the release-evidence timestamp boundary implemented by `scripts/release-evidence.mjs`. It describes a deliberately narrower repository contract than the full Internet timestamp grammar; it does not create release, deployment, licensing, ownership, or acquisition authority.

## Standards basis

RFC 3339 defines an Internet profile of ISO 8601 for timestamps and permits UTC offsets plus optional fractional seconds. RFC 9557 extends RFC 3339 with optional additional information such as time-zone annotations. Noema's retained release evidence does not need those alternate serializations or extensions: it needs one byte-stable representation of the same instant so evidence can be compared, signed, hashed, and audited without equivalent-but-different timestamp strings.

For that narrower evidence contract, Noema accepts only `YYYY-MM-DDTHH:mm:ss.sssZ`. The validator also parses the instant and requires `new Date(parsed).toISOString()` to equal the original string exactly. The combined grammar-and-round-trip check rejects date-only values, explicit offsets, omitted milliseconds, impossible calendar values that a runtime might normalize, and other semantically parseable but non-canonical spellings.

The restriction is an application-level canonicalization profile. It must not be described as the complete RFC 3339 or RFC 9557 grammar.

## Verification

`test/release-evidence-canonical-time.test.ts` invokes the real release-evidence entrypoint with a valid bounded source archive and CycloneDX SBOM fixture. It requires representative non-canonical timestamp spellings to fail before `release-evidence.json` is published and requires the canonical UTC millisecond form to be retained verbatim.

## References

Klyne, G., & Newman, C. (2002). *Date and time on the Internet: Timestamps* (RFC 3339). RFC Editor. https://doi.org/10.17487/RFC3339

Sharma, U., & Bormann, C. (2024). *Date and time on the Internet: Timestamps with additional information* (RFC 9557). RFC Editor. https://doi.org/10.17487/RFC9557
