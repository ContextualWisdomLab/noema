# Doctoring amendment: raw embedded-runtime scanner evidence

## Status

- **Decision date:** 2026-08-07
- **Applies to:** PR #67 patch-validator static-runtime evidence
- **Release claim:** none
- **Production activation claim:** none
- **Workflow migration state:** intentionally RED until the workflow emits the raw per-component evidence required by the verifier

This amendment supersedes the earlier locally synthesized completion model. The exact-head regressions demonstrated that a zero-match component could look complete without proving that Grype evaluated the reviewed package identity, and that independently valid per-component results could still be substituted across artifacts or vulnerability-database snapshots.

## Finding

An empty vulnerability match list is negative finding evidence, not proof that a particular package identity was evaluated. The earlier workflow constructed a local completion object after an aggregate SBOM scan and used generic package identities for native dependencies. That was insufficient for a fully static Node runtime because an unsupported or weak identity could produce zero matches without distinguishing “evaluated and clean” from “no applicable matcher.”

The finding remains valid until the workflow itself emits the new evidence shape. The verifier is now stricter than the workflow on purpose: unsupported identities, synthetic completion fields, mismatched match artifacts, and database drift fail closed rather than being grandfathered as historical compatibility behavior.

## Control decision

The embedded-runtime evidence boundary now uses a **reviewed identity catalog** keyed by the exact `process.versions` key. A bundled dependency is eligible for scanning only when the catalog binds that key to the expected inventory name and to exactly one scanner-supported identity form:

1. an exact npm PURL whose package name and version match the catalog and `process.versions`; or
2. an exact CPE 2.3 application identity whose reviewed vendor, product, and version match the catalog and `process.versions`.

Unknown keys, generic PURLs, wildcard or placeholder CPE vendors/products, arbitrary aliases, and identities inferred from receipt-controlled fields are explicit release blockers. Current catalog entries are deliberately bounded; adding a new native dependency requires evidence review rather than automatic identity fabrication.

Every bundled dependency must then carry **raw Grype** JSON for a direct scan of that exact reviewed identity. The verifier requires:

- scanner descriptor `grype` at the pinned version;
- scanner source type consistent with PURL or CPE and a source target exactly equal to the reviewed identity;
- a valid vulnerability-database status record;
- bounded provider metadata with capture timestamps and input digests;
- no ignored matches;
- every reported match artifact bound back to the same reviewed PURL or CPE and exact component version;
- no MEDIUM, HIGH, CRITICAL, or UNKNOWN finding; and
- the **same vulnerability database** identity across every component scan.

The canonical shared database identity is derived from the database schema/build metadata plus sorted provider capture/input metadata and is retained in verification output. This makes database drift visible rather than allowing two components in one acceptance decision to be evaluated against different snapshots.

The workflow migration must update Grype's vulnerability database once, freeze per-component auto-update for the scan set, invoke each reviewed PURL or CPE directly, and retain the raw scanner result. A local “completed” flag, aggregate-only SBOM result, scanner process exit alone, or grouped synthetic result is not evidence of component evaluation.

## Why this is stricter than zero findings

Grype's *Supported scan targets* documentation treats individual PURL and CPE identities as explicit scan targets. Its vulnerability-database documentation also explains that the database is locally cached and can be updated explicitly. Noema therefore binds acceptance to the literal scanner target and one shared database snapshot rather than inferring assessment from an empty match array.

The National Vulnerability Database maintains the Official Common Platform Enumeration (CPE) Dictionary. Noema treats an authoritative NVD CPE mapping as reviewed identity evidence where a CPE is used; a merely syntactically valid CPE is not sufficient. For example, NVD records OpenSSL under vendor/product `openssl:openssl`, and NVD's analysis of CVE-2026-40170 maps ngtcp2 through reviewed CPE configurations including `nghttp2:ngtcp2` while identifying 1.22.1 as the fixed floor. Those mappings are controls, not heuristics generated from a package name at runtime.

Node.js documents `process.versions` as version information for Node.js and its dependencies. Noema uses it as the exact-runtime dependency declaration that the reviewed component set must match, not as a cryptographic proof of binary composition. `modules` and `napi` remain explicitly reviewed runtime metadata rather than fabricated vulnerable packages.

## Residual risk

Raw scanner evidence does not prove that vulnerability databases are complete or that every upstream project has an authoritative ecosystem identity. Catalog omissions therefore fail closed. The scanner binary, database acquisition path, hosted runner, workflow source, CPE/PURL review process, and upstream advisory coverage remain part of the trust chain. Future registry publication must separately bind signature, SBOM, vulnerability evidence, SLSA provenance, and the published digest before release acceptance.

## APA 7th references

Anchore. (2026). *Supported scan targets*. Anchore Open Source. https://oss.anchore.com/docs/guides/vulnerability/scan-targets/

Anchore. (2026). *Vulnerability database*. Anchore Open Source. https://oss.anchore.com/docs/guides/vulnerability/database/

National Institute of Standards and Technology. (2025). *Official Common Platform Enumeration (CPE) dictionary*. National Vulnerability Database. https://nvd.nist.gov/products/cpe

National Institute of Standards and Technology. (2026). *CVE-2026-40170 detail*. National Vulnerability Database. https://nvd.nist.gov/vuln/detail/CVE-2026-40170

Node.js contributors. (2026). *Process: `process.versions`* (Node.js v24 documentation). OpenJS Foundation. https://nodejs.org/download/release/latest-v24.x/docs/api/process.html#processversions

OWASP Foundation. (2025). *CycloneDX specification 1.7*. https://cyclonedx.org/specification/overview/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
