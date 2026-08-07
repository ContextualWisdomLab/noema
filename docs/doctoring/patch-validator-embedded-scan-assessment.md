# Doctoring amendment: positive embedded-runtime scan assessment

## Status

- **Decision date:** 2026-08-07
- **Applies to:** PR #67 patch-validator static-runtime evidence
- **Release claim:** none
- **Production activation claim:** none

This amendment records the test-first control added after the exact-head regression `test/patch-validator-embedded-runtime-assessment.test.ts` demonstrated that a syntactically complete per-component receipt with `matches: []` could be accepted without proving that the reviewed component identity was actually presented to the vulnerability-scanning lane.

## Finding

An empty vulnerability match list is negative finding evidence, not by itself positive evidence that a particular component identity was assessed. That distinction matters for a fully static Node runtime because the runtime's dependency versions are derived from the exact image's `process.versions`, then represented as package identities for a separate SBOM scan. If a receipt can fabricate a zero-match component without binding the scanner execution to the reviewed identity, a missing or dropped scanner input can become indistinguishable from a clean assessment.

The finding is therefore valid and current rather than stale or duplicative. It is separate from the earlier control that requires one receipt entry per bundled dependency: cardinality and key equality prove receipt completeness, while positive assessment binding proves that each receipt entry names the exact reviewed scanner input.

## Control decision

The embedded-runtime evidence contract now requires every bundled dependency receipt to contain a positive assessment record with all of the following properties:

1. `status` is exactly `completed`;
2. `scanner` is exactly `grype@0.116.1`; and
3. `identity` is exactly the reviewed component identity that the verifier derived independently from the exact-image inventory.

The workflow creates this record only after the checksum-pinned Grype invocation over the generated embedded-runtime CycloneDX SBOM completes and its bounded JSON result is parsed. The verifier then cross-checks the record independently of the vulnerability match list. Missing, malformed, incomplete, scanner-mismatched, or identity-mismatched assessment evidence fails closed even when `matches` is empty.

This control does **not** convert an empty result into a proof that no vulnerability exists. It only closes the narrower evidence-substitution gap: a zero-match result is accepted as a completed scanner observation only when it is bound to the exact reviewed component identity. Existing controls still reject ignored matches and MEDIUM, HIGH, CRITICAL, or UNKNOWN findings, and explicit reviewed security floors remain necessary where scanner identity coverage is known to be incomplete.

## Standards and primary-source rationale

- Grype explicitly supports scanning pre-generated CycloneDX SBOMs and individual PURL/CPE package identities. That supports treating the reviewed SBOM identity as the scanner-input identity rather than inferring assessment from vulnerability matches alone.
- Node.js documents `process.versions` as an object containing version strings for Node.js and its dependencies. Noema uses it as an exact-runtime dependency declaration, not as a cryptographic proof of complete binary composition.
- CycloneDX 1.7 is the current OWASP CycloneDX specification as of this amendment. PR #67 still emits CycloneDX 1.6 for the embedded scanner-input document because changing the serialization version is a separate interoperability decision that must be validated against the pinned scanner before migration; the positive-assessment control is schema-version independent.
- NIST SP 800-218 Version 1.1 remains the current final SSDF publication. NIST SP 800-218 Rev. 1 / SSDF Version 1.2 is an initial public draft, so it is treated as forward-looking context rather than a final normative requirement. Both reinforce acquisition-oriented traceability, component-risk handling, and evidence retention, but Noema's exact per-component assessment record is a stricter project control rather than a claim that NIST prescribes this JSON shape.

## Residual risk

The assessment record demonstrates completion and exact identity binding within the trusted workflow boundary; it is not a cryptographic attestation from Grype. Grype's database freshness, matcher behavior, ecosystem modeling, and advisory completeness remain external dependencies. The workflow source, scanner binary, scanner database retrieval path, hosted runner, and generated SBOM therefore remain part of the evidence trust chain. Future registry publication must independently bind signed provenance, SBOM, vulnerability evidence, and the published digest before release acceptance.

## APA 7th references

Anchore. (2026). *Supported scan targets*. Anchore Open Source. https://oss.anchore.com/docs/guides/vulnerability/scan-targets/

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure Software Development Framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://csrc.nist.gov/pubs/sp/800/218/r1/ipd

Node.js contributors. (2026). *Process: `process.versions`* (Node.js v24 documentation). OpenJS Foundation. https://nodejs.org/download/release/latest-v24.x/docs/api/process.html#processversions

OWASP Foundation. (2025). *CycloneDX specification 1.7*. https://cyclonedx.org/specification/overview/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
